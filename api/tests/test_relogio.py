"""Rota de expiração sem processo de fundo: só o segredo abre a porta."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete

from app.core import config as modulo_config
from app.core.db import FabricaDeSessao
from app.models.operacao import Almoco, Pedido


def _com_segredo(monkeypatch, valor: str) -> None:
    """`obter_config` é cacheado; sem limpar o cache, o segredo do teste
    anterior sobrevive e o próximo teste passaria por acidente."""
    monkeypatch.setattr(modulo_config.obter_config(), "cron_secret", valor)


def test_sem_segredo_configurado_a_rota_fica_fechada(cliente, monkeypatch):
    """Segredo vazio não pode significar rota aberta: seria o oposto de
    'fechado por padrão'."""
    _com_segredo(monkeypatch, "")
    r = cliente.post("/relogio/expirar", headers={"authorization": "Bearer qualquer-coisa"})
    assert r.status_code == 401


def test_segredo_errado_e_recusado(cliente, monkeypatch):
    _com_segredo(monkeypatch, "o-segredo-certo")
    r = cliente.post("/relogio/expirar", headers={"authorization": "Bearer chute"})
    assert r.status_code == 401


def test_sem_cabecalho_e_recusado(cliente, monkeypatch):
    _com_segredo(monkeypatch, "o-segredo-certo")
    assert cliente.post("/relogio/expirar").status_code == 401


def test_segredo_certo_expira_pedido_e_almoco(cliente, monkeypatch, dados):
    """A mesma lógica do script `relogio.py` — só muda quem aciona."""
    _com_segredo(monkeypatch, "o-segredo-certo")
    agora = datetime.now(UTC)

    with FabricaDeSessao() as s:
        pessoa_id = dados["ativo"]
        s.add(
            Pedido(
                colaborador_id=pessoa_id,
                empresa_id=dados["empresa"],
                vinculo="clt",
                matricula=3000,
                valor_total=Decimal("10.00"),
                status="pendente",
                codigo_retirada="999999",
                criado_em=agora - timedelta(hours=99),
            )
        )
        s.add(
            Almoco(
                colaborador_id=pessoa_id,
                empresa_id=dados["empresa"],
                vinculo="clt",
                matricula=3000,
                codigo_barras="00000000000123",
                status="pendente",
                origem="totem",
                valor=Decimal("18.00"),
                criado_em=agora - timedelta(hours=13),
                expira_em=agora - timedelta(hours=1),
            )
        )
        s.commit()

    r = cliente.post(
        "/relogio/expirar", headers={"authorization": "Bearer o-segredo-certo"}
    )
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["pedidos_expirados"] >= 1
    assert corpo["almocos_expirados"] >= 1

    with FabricaDeSessao() as s:
        s.execute(delete(Pedido).where(Pedido.codigo_retirada == "999999"))
        s.execute(delete(Almoco).where(Almoco.codigo_barras == "00000000000123"))
        s.commit()
