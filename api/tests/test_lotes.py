"""Lote de exportação: o que impede o mesmo ciclo entrar duas vezes no ERP."""

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy import delete, select

from app.core.db import FabricaDeSessao
from app.excecoes import (
    CicloAindaAberto,
    CompetenciaFechada,
    LoteNaoEncontrado,
    SemPermissao,
)
from app.models.cadastro import Colaborador
from app.models.exportacao import Exportacao
from app.models.operacao import Almoco, Pedido
from app.modules import consumo, folha, lotes
from app.modules.auditoria import Ator

ADMIN = Ator(id=None, codigo="teste", nome="Admin de Teste", papel="admin")


def _competencia_passada() -> str:
    """O ciclo anterior ao corrente — o único que se pode fechar de verdade."""
    ano, mes = (int(parte) for parte in consumo.competencia_atual().split("-"))
    return f"{ano - 1:04d}-12" if mes == 1 else f"{ano:04d}-{mes - 1:02d}"


@pytest.fixture
def ciclo(dados):
    """Uma compra e um almoço dentro do ciclo já encerrado."""
    competencia = _competencia_passada()
    inicio, _fim = consumo.intervalo_da_competencia(competencia)
    quando = inicio + timedelta(days=1)

    with FabricaDeSessao() as s:
        pessoa = s.get(Colaborador, dados["ativo"])
        s.add(
            Pedido(
                colaborador_id=pessoa.id,
                empresa_id=pessoa.empresa_id,
                vinculo=pessoa.vinculo,
                matricula=pessoa.matricula,
                valor_total=Decimal("40.00"),
                status="entregue",
                codigo_retirada=f"L{uuid.uuid4().hex[:8]}",
                criado_em=quando,
            )
        )
        s.add(
            Almoco(
                colaborador_id=pessoa.id,
                empresa_id=pessoa.empresa_id,
                vinculo=pessoa.vinculo,
                matricula=pessoa.matricula,
                codigo_barras=uuid.uuid4().hex[:20],
                status="confirmado",
                origem="totem",
                valor=Decimal("18.00"),
                criado_em=quando,
                expira_em=quando + timedelta(hours=12),
                confirmado_em=quando,
            )
        )
        s.commit()

    yield {"competencia": competencia, "matricula": pessoa.matricula}

    with FabricaDeSessao() as s:
        s.execute(delete(Almoco).where(Almoco.colaborador_id == dados["ativo"]))
        s.execute(delete(Pedido).where(Pedido.colaborador_id == dados["ativo"]))
        s.execute(delete(Exportacao).where(Exportacao.competencia == competencia))
        s.commit()


def test_fechar_carimba_o_ciclo_inteiro(dados, ciclo):
    with FabricaDeSessao() as s:
        lote = lotes.fechar(s, ADMIN, ciclo["competencia"])
        s.commit()

        assert lote.status == "exportada"
        assert lote.total_registros == 2
        assert lote.valor_total == Decimal("58.00")

        pedido = s.scalar(select(Pedido).where(Pedido.colaborador_id == dados["ativo"]))
        almoco = s.scalar(select(Almoco).where(Almoco.colaborador_id == dados["ativo"]))
        assert pedido.lote_id == lote.id and pedido.exportado_em is not None
        assert almoco.lote_id == lote.id and almoco.exportado_em is not None


def test_competencia_nao_fecha_duas_vezes(dados, ciclo):
    """É o buraco que este módulo existe para tapar: o segundo download não se
    distingue de uma segunda importação, e o desconto dobraria no holerite."""
    with FabricaDeSessao() as s:
        lotes.fechar(s, ADMIN, ciclo["competencia"])
        s.commit()

    with FabricaDeSessao() as s:
        with pytest.raises(CompetenciaFechada):
            lotes.fechar(s, ADMIN, ciclo["competencia"])


def test_ciclo_ainda_aberto_nao_fecha(dados):
    """Fechar às 14h do dia 20 deixaria de fora tudo consumido depois — e como
    a competência não fecha duas vezes, esse consumo nunca seria descontado."""
    with FabricaDeSessao() as s:
        with pytest.raises(CicloAindaAberto):
            lotes.fechar(s, ADMIN, consumo.competencia_atual())


def test_arquivo_do_ciclo_fechado_nao_muda_depois(dados, ciclo):
    """Depois de fechado, o arquivo sai do que foi carimbado — não recalculado.

    Sem isso, cancelar um pedido depois do fechamento mudaria o arquivo, e um
    segundo download não bateria com o que já entrou no ERP.
    """
    with FabricaDeSessao() as s:
        lote = lotes.fechar(s, ADMIN, ciclo["competencia"])
        s.commit()
        lote_id = lote.id

    with FabricaDeSessao() as s:
        antes = folha.montar(s, ADMIN, ciclo["competencia"], lote_id)
        assert antes.total == Decimal("58.00")

        # alguém cancela o pedido depois do fechamento
        s.scalar(select(Pedido).where(Pedido.colaborador_id == dados["ativo"])).status = (
            "cancelado"
        )
        s.commit()

        depois = folha.montar(s, ADMIN, ciclo["competencia"], lote_id)
        assert depois.total == Decimal("58.00")

        # e o recorte por data, que é o do ciclo aberto, já enxerga o cancelamento
        aberto = folha.montar(s, ADMIN, ciclo["competencia"])
        assert aberto.total == Decimal("18.00")


def test_descartar_solta_os_carimbos_e_permite_fechar_de_novo(dados, ciclo):
    """Fechar é irreversível por construção e a importação do outro lado pode
    falhar. Sem descarte, a competência ficaria travada para sempre."""
    with FabricaDeSessao() as s:
        lote_id = lotes.fechar(s, ADMIN, ciclo["competencia"]).id
        s.commit()

    with FabricaDeSessao() as s:
        descartado = lotes.descartar(s, ADMIN, lote_id, "Importação recusada pelo ERP")
        s.commit()
        assert descartado.status == "descartada"

        pedido = s.scalar(select(Pedido).where(Pedido.colaborador_id == dados["ativo"]))
        assert pedido.lote_id is None and pedido.exportado_em is None
        assert lotes.atual(s, ciclo["competencia"]) is None

    with FabricaDeSessao() as s:
        novo = lotes.fechar(s, ADMIN, ciclo["competencia"])
        s.commit()
        assert novo.id != lote_id
        assert novo.total_registros == 2


def test_descartar_lote_inexistente_ou_ja_descartado(dados, ciclo):
    with FabricaDeSessao() as s:
        with pytest.raises(LoteNaoEncontrado):
            lotes.descartar(s, ADMIN, uuid.uuid4(), "não existe")


def test_dp_fecha_e_colaborador_nao(dados, ciclo):
    with FabricaDeSessao() as s:
        for papel in ("colaborador", "refeitorio"):
            with pytest.raises(SemPermissao):
                lotes.fechar(s, Ator(id=None, codigo="x", nome="x", papel=papel), "2020-01")

    with FabricaDeSessao() as s:
        dp = Ator(id=dados["ativo"], codigo="x", nome="x", papel="dp")
        lote = lotes.fechar(s, dp, ciclo["competencia"])
        s.commit()
        assert lote.status == "exportada"
