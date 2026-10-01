"""Venda de loja a visitante: cortesia por item, Pix só sobre o valor pago,
confirmação manual (sem webhook de banco/PSP) e cancelamento antes de pagar."""

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import delete, select

from app.core import contexto, pix
from app.core.db import FabricaDeSessao
from app.excecoes import PedidoNaoAguardandoPagamento, SemPermissao
from app.models.auditoria import LogAuditoria
from app.models.cadastro import CategoriaProduto, Colaborador, Produto
from app.models.operacao import ItemPedido, Pedido
from app.modules import pedidos, precos
from app.modules.auditoria import Ator
from tests.conftest import CODIGO, SENHA

PREFIXO = "T-PIXV-"


@pytest.fixture(autouse=True)
def _contexto_de_teste():
    contexto.definir(correlacao_id=uuid.uuid4(), ip=None, user_agent=None)


@pytest.fixture(autouse=True)
def _pix_configurado(monkeypatch):
    from app.core.config import obter_config

    config = obter_config()
    monkeypatch.setattr(config, "pix_chave", "financeiro@exemplo.com.br")
    monkeypatch.setattr(config, "pix_recebedor", "Empresa Exemplo Ltda")
    monkeypatch.setattr(config, "pix_cidade", "Goiânia")


@pytest.fixture
def produtos_teste(dados):
    with FabricaDeSessao() as s:
        categoria = CategoriaProduto(nome=f"{PREFIXO}Categoria")
        s.add(categoria)
        s.flush()
        pago = Produto(
            nome="Refrigerante", codigo=f"{PREFIXO}PAGO", categoria_id=categoria.id,
            custo=Decimal("2.00"), preco_venda=Decimal("5.00"), estoque=10,
        )
        cortesia = Produto(
            nome="Bala", codigo=f"{PREFIXO}CORTESIA", categoria_id=categoria.id,
            custo=Decimal("0.50"), preco_venda=Decimal("2.00"), estoque=10,
        )
        s.add_all([pago, cortesia])
        s.commit()
        ids = {"categoria": categoria.id, "pago": pago.id, "cortesia": cortesia.id}

    yield ids

    with FabricaDeSessao() as s:
        pedido_ids = select(Pedido.id).where(Pedido.visitante_nome.like(f"{PREFIXO}%"))
        s.execute(delete(ItemPedido).where(ItemPedido.pedido_id.in_(pedido_ids)))
        s.execute(delete(LogAuditoria).where(LogAuditoria.entidade_id.in_(pedido_ids)))
        s.execute(delete(Pedido).where(Pedido.visitante_nome.like(f"{PREFIXO}%")))
        s.execute(delete(Produto).where(Produto.id.in_([ids["pago"], ids["cortesia"]])))
        s.execute(delete(CategoriaProduto).where(CategoriaProduto.id == ids["categoria"]))
        s.commit()


def _admin() -> Ator:
    return Ator(id=None, codigo="admin-teste", nome="Admin", papel="admin")


def test_crc16_bate_com_vetor_de_referencia():
    """'123456789' é o vetor de referência catalogado pra CRC-16/CCITT-FALSE
    (poly 0x1021, init 0xFFFF) — check value 0x29B1."""
    assert pix._crc16("123456789") == "29B1"


def test_payload_pix_tem_os_campos_no_formato_padrao():
    gerado = pix.gerar(valor=Decimal("47.00"), txid="000123")

    assert gerado.copia_cola.startswith("000201")
    assert "52040000" in gerado.copia_cola
    assert "5303986" in gerado.copia_cola
    assert "540547.00" in gerado.copia_cola
    assert "5802BR" in gerado.copia_cola
    assert gerado.copia_cola.endswith("6304" + pix._crc16(gerado.copia_cola[:-4]))
    assert gerado.qr_code_base64.startswith("data:image/png;base64,")


def test_venda_com_cortesia_e_pago_cobra_so_o_pago(produtos_teste):
    with FabricaDeSessao() as s:
        resultado = pedidos.vender_a_visitante(
            s,
            _admin(),
            f"{PREFIXO}Fulano",
            [
                pedidos.ItemDeVendaAVisitante(
                    produto_id=produtos_teste["pago"], quantidade=2, brinde=False
                ),
                pedidos.ItemDeVendaAVisitante(
                    produto_id=produtos_teste["cortesia"], quantidade=1, brinde=True
                ),
            ],
        )
        s.commit()

    assert resultado.pedido.valor_total == Decimal("10.00")
    assert resultado.pedido.status == "aguardando_pagamento"
    assert resultado.pix is not None
    assert resultado.pix.valor == Decimal("10.00")
    assert resultado.pix.txid == resultado.pedido.codigo_retirada

    with FabricaDeSessao() as s:
        assert s.get(Produto, produtos_teste["pago"]).estoque == 8
        assert s.get(Produto, produtos_teste["cortesia"]).estoque == 9
        itens = list(
            s.scalars(select(ItemPedido).where(ItemPedido.pedido_id == resultado.pedido.id))
        )
        brinde_item = next(i for i in itens if i.produto_id == produtos_teste["cortesia"])
        pago_item = next(i for i in itens if i.produto_id == produtos_teste["pago"])
        assert brinde_item.brinde is True
        assert brinde_item.preco_unitario == Decimal("0.00")
        assert pago_item.brinde is False
        assert pago_item.preco_unitario == Decimal("5.00")


def test_venda_cem_por_cento_cortesia_confirma_direto_sem_pix(produtos_teste):
    with FabricaDeSessao() as s:
        resultado = pedidos.vender_a_visitante(
            s,
            _admin(),
            f"{PREFIXO}Cortesia Total",
            [
                pedidos.ItemDeVendaAVisitante(
                    produto_id=produtos_teste["cortesia"], quantidade=1, brinde=True
                )
            ],
        )
        s.commit()

    assert resultado.pedido.valor_total == Decimal("0.00")
    assert resultado.pedido.status == "entregue"
    assert resultado.pedido.entregue_em is not None
    assert resultado.pix is None


def test_confirmar_pix_muda_status_e_grava_auditoria(produtos_teste):
    with FabricaDeSessao() as s:
        venda = pedidos.vender_a_visitante(
            s, _admin(), f"{PREFIXO}A Confirmar",
            [pedidos.ItemDeVendaAVisitante(
                produto_id=produtos_teste["pago"], quantidade=1, brinde=False
            )],
        )
        s.commit()
        pedido_id = venda.pedido.id

    with FabricaDeSessao() as s:
        confirmado = pedidos.confirmar_pix(s, _admin(), pedido_id)
        s.commit()

    assert confirmado.status == "entregue"
    assert confirmado.pix_confirmado_em is not None
    assert confirmado.entregue_em is not None

    with FabricaDeSessao() as s:
        log = s.scalar(
            select(LogAuditoria).where(
                LogAuditoria.entidade_id == pedido_id,
                LogAuditoria.acao == "pedido.pix_confirmado",
            )
        )
        assert log is not None


def test_confirmar_pix_recusa_pedido_que_nao_esta_aguardando(produtos_teste):
    with FabricaDeSessao() as s:
        venda = pedidos.vender_a_visitante(
            s, _admin(), f"{PREFIXO}Ja Entregue",
            [pedidos.ItemDeVendaAVisitante(
                produto_id=produtos_teste["cortesia"], quantidade=1, brinde=True
            )],
        )
        s.commit()
        pedido_id = venda.pedido.id

    with FabricaDeSessao() as s:
        with pytest.raises(PedidoNaoAguardandoPagamento):
            pedidos.confirmar_pix(s, _admin(), pedido_id)


def test_cancelar_antes_de_pagar_devolve_estoque(produtos_teste):
    with FabricaDeSessao() as s:
        venda = pedidos.vender_a_visitante(
            s, _admin(), f"{PREFIXO}Desistiu",
            [pedidos.ItemDeVendaAVisitante(
                produto_id=produtos_teste["pago"], quantidade=3, brinde=False
            )],
        )
        s.commit()
        pedido_id = venda.pedido.id

    with FabricaDeSessao() as s:
        cancelado = pedidos.cancelar(s, _admin(), pedido_id, "Visitante desistiu")
        s.commit()

    assert cancelado.status == "cancelado"
    with FabricaDeSessao() as s:
        assert s.get(Produto, produtos_teste["pago"]).estoque == 10


def test_colaborador_comum_nao_vende_a_visitante_nem_confirma(dados, produtos_teste):
    comum = Ator(id=dados["ativo"], codigo="x", nome="x", papel="colaborador")
    with FabricaDeSessao() as s:
        with pytest.raises(SemPermissao):
            pedidos.vender_a_visitante(
                s, comum, f"{PREFIXO}Teste",
                [pedidos.ItemDeVendaAVisitante(
                    produto_id=produtos_teste["pago"], quantidade=1, brinde=False
                )],
            )

    with FabricaDeSessao() as s:
        venda = pedidos.vender_a_visitante(
            s, _admin(), f"{PREFIXO}Alvo",
            [pedidos.ItemDeVendaAVisitante(
                produto_id=produtos_teste["pago"], quantidade=1, brinde=False
            )],
        )
        s.commit()
        pedido_id = venda.pedido.id

    with FabricaDeSessao() as s:
        with pytest.raises(SemPermissao):
            pedidos.confirmar_pix(s, comum, pedido_id)


def test_rotas_de_venda_a_visitante_exigem_admin(cliente, dados):
    with FabricaDeSessao() as s:
        colaborador = s.get(Colaborador, dados["ativo"])
        colaborador.senha_provisoria = False
        s.commit()
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    assert cliente.post("/pedidos/visitante", json={
        "visitante_nome": "x", "itens": [{"produto_id": str(uuid.uuid4()), "quantidade": 1}],
    }).status_code == 403
    assert cliente.get("/pedidos/visitante?de=2026-01-01&ate=2026-01-01").status_code == 403
    assert cliente.post(f"/pedidos/{uuid.uuid4()}/confirmar-pix").status_code == 403


def test_fluxo_completo_pelas_rotas_http(cliente, dados, produtos_teste):
    """Cobre o caminho que o front realmente usa: rota -> schema -> serialização,
    não só a função do módulo por baixo."""
    with FabricaDeSessao() as s:
        colaborador = s.get(Colaborador, dados["ativo"])
        colaborador.papel = "admin"
        colaborador.senha_provisoria = False
        s.commit()
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    resposta = cliente.post(
        "/pedidos/visitante",
        json={
            "visitante_nome": f"{PREFIXO}Http",
            "itens": [
                {"produto_id": str(produtos_teste["pago"]), "quantidade": 1, "brinde": False},
                {"produto_id": str(produtos_teste["cortesia"]), "quantidade": 1, "brinde": True},
            ],
        },
    )
    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["pedido"]["status"] == "aguardando_pagamento"
    assert corpo["pedido"]["visitante_nome"] == f"{PREFIXO}Http"
    assert corpo["pix"]["valor"] == "5.00"
    assert corpo["pix"]["copia_cola"].startswith("000201")
    assert corpo["pix"]["qr_code_base64"].startswith("data:image/png;base64,")
    pedido_id = corpo["pedido"]["id"]

    hoje = precos.hoje_local()
    listagem = cliente.get(f"/pedidos/visitante?de={hoje}&ate={hoje}")
    assert listagem.status_code == 200
    assert any(p["id"] == pedido_id for p in listagem.json())

    confirmado = cliente.post(f"/pedidos/{pedido_id}/confirmar-pix")
    assert confirmado.status_code == 200
    assert confirmado.json()["status"] == "entregue"
    assert confirmado.json()["pix_confirmado_em"] is not None
