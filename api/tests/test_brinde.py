"""Brinde de aniversário: um item de graça no mês civil do aniversário."""

import uuid
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import delete, select

from app.core.config import obter_config
from app.core.db import FabricaDeSessao
from app.excecoes import (
    BrindeForaDoCarrinho,
    BrindeForaDoMes,
    BrindeJaUsado,
    BrindeSemMesCadastrado,
)
from app.models.cadastro import CategoriaProduto, Colaborador, Produto
from app.models.operacao import ItemPedido, Pedido
from app.modules import pedidos
from app.modules.auditoria import Ator
from tests.conftest import CODIGO

_config = obter_config()


def _mes_atual() -> int:
    return datetime.now(ZoneInfo(_config.fuso)).month


def _outro_mes() -> int:
    return 1 if _mes_atual() != 1 else 2


@pytest.fixture
def produto(dados):
    with FabricaDeSessao() as s:
        categoria = CategoriaProduto(nome=f"Teste Brinde {uuid.uuid4().hex[:6]}")
        s.add(categoria)
        s.flush()
        item = Produto(
            nome="Picolé de teste",
            codigo=f"PIC-{uuid.uuid4().hex[:8]}",
            categoria_id=categoria.id,
            custo=Decimal("1.80"),
            preco_venda=Decimal("4.00"),
            estoque=10,
        )
        s.add(item)
        s.commit()
        ids = {"produto": item.id, "categoria": categoria.id}

    yield ids

    with FabricaDeSessao() as s:
        alvo = select(Pedido.id).where(Pedido.colaborador_id == dados["ativo"])
        s.execute(delete(ItemPedido).where(ItemPedido.pedido_id.in_(alvo)))
        s.execute(delete(Pedido).where(Pedido.colaborador_id == dados["ativo"]))
        s.execute(delete(Produto).where(Produto.id == ids["produto"]))
        s.execute(delete(CategoriaProduto).where(CategoriaProduto.id == ids["categoria"]))
        s.commit()


def _aniversariante(dados, mes: int | None) -> None:
    with FabricaDeSessao() as s:
        s.get(Colaborador, dados["ativo"]).mes_aniversario = mes
        s.commit()


def _ator(dados) -> Ator:
    return Ator(id=dados["ativo"], codigo=CODIGO, nome="Fulano de Teste", papel="colaborador")


def _itens(sessao, pedido_id) -> list[ItemPedido]:
    return list(
        sessao.scalars(
            select(ItemPedido)
            .where(ItemPedido.pedido_id == pedido_id)
            .order_by(ItemPedido.preco_unitario)
        )
    )


def test_um_item_sai_zerado_no_mes_do_aniversario(dados, produto):
    _aniversariante(dados, _mes_atual())

    with FabricaDeSessao() as s:
        pedido = pedidos.finalizar(s, _ator(dados), [(produto["produto"], 1)], produto["produto"])
        s.commit()

        assert pedido.valor_total == Decimal("0.00")
        itens = _itens(s, pedido.id)
        assert len(itens) == 1
        assert itens[0].brinde is True
        assert itens[0].preco_unitario == Decimal("0.00")
        # O custo continua real: para a margem, isto é custo sem receita, e não
        # um item que nunca saiu da prateleira.
        assert itens[0].custo_unitario == Decimal("1.80")
        assert s.get(Produto, produto["produto"]).estoque == 9


def test_tres_unidades_pagam_duas(dados, produto):
    """O brinde zera uma unidade, não a linha inteira. A linha é partida em
    duas para o `valor_total` continuar sendo a soma pura dos itens."""
    _aniversariante(dados, _mes_atual())

    with FabricaDeSessao() as s:
        pedido = pedidos.finalizar(s, _ator(dados), [(produto["produto"], 3)], produto["produto"])
        s.commit()

        assert pedido.valor_total == Decimal("8.00")
        gratis, pago = _itens(s, pedido.id)
        assert (gratis.quantidade, gratis.preco_unitario, gratis.brinde) == (
            1,
            Decimal("0.00"),
            True,
        )
        assert (pago.quantidade, pago.preco_unitario, pago.brinde) == (2, Decimal("4.00"), False)
        assert gratis.quantidade + pago.quantidade == 3
        assert s.get(Produto, produto["produto"]).estoque == 7


def test_so_uma_vez_no_mes(dados, produto):
    _aniversariante(dados, _mes_atual())

    with FabricaDeSessao() as s:
        pedidos.finalizar(s, _ator(dados), [(produto["produto"], 1)], produto["produto"])
        s.commit()

    with FabricaDeSessao() as s:
        assert pedidos.brinde_do_mes(s, _ator(dados)).usado is True
        with pytest.raises(BrindeJaUsado):
            pedidos.finalizar(s, _ator(dados), [(produto["produto"], 1)], produto["produto"])


def test_pedido_cancelado_devolve_o_direito(dados, produto):
    """O pedido que expirou sem retirada devolveu o estoque. Cobrar o brinde
    por ele seria punir a pessoa por uma entrega que não aconteceu."""
    _aniversariante(dados, _mes_atual())

    with FabricaDeSessao() as s:
        pedido = pedidos.finalizar(s, _ator(dados), [(produto["produto"], 1)], produto["produto"])
        s.commit()
        pedido_id = pedido.id

    with FabricaDeSessao() as s:
        s.get(Pedido, pedido_id).status = "cancelado"
        s.commit()

    with FabricaDeSessao() as s:
        assert pedidos.brinde_do_mes(s, _ator(dados)).disponivel is True


def test_fora_do_mes_do_aniversario_recusa(dados, produto):
    _aniversariante(dados, _outro_mes())

    with FabricaDeSessao() as s:
        direito = pedidos.brinde_do_mes(s, _ator(dados))
        assert direito.e_meu_mes is False
        assert direito.disponivel is False
        with pytest.raises(BrindeForaDoMes):
            pedidos.finalizar(s, _ator(dados), [(produto["produto"], 1)], produto["produto"])


def test_sem_mes_cadastrado_recusa(dados, produto):
    _aniversariante(dados, None)

    with FabricaDeSessao() as s:
        assert pedidos.brinde_do_mes(s, _ator(dados)).mes is None
        with pytest.raises(BrindeSemMesCadastrado):
            pedidos.finalizar(s, _ator(dados), [(produto["produto"], 1)], produto["produto"])


def test_brinde_precisa_estar_no_carrinho(dados, produto):
    """Sem esta checagem o pedido sairia com um item de graça que ninguém pediu."""
    _aniversariante(dados, _mes_atual())

    with FabricaDeSessao() as s:
        with pytest.raises(BrindeForaDoCarrinho):
            pedidos.finalizar(s, _ator(dados), [(produto["produto"], 1)], uuid.uuid4())


def test_compra_sem_brinde_continua_igual(dados, produto):
    """A regra nova não pode mudar o pedido de quem não pediu brinde nenhum."""
    _aniversariante(dados, _mes_atual())

    with FabricaDeSessao() as s:
        pedido = pedidos.finalizar(s, _ator(dados), [(produto["produto"], 2)])
        s.commit()

        assert pedido.valor_total == Decimal("8.00")
        itens = _itens(s, pedido.id)
        assert len(itens) == 1
        assert itens[0].brinde is False
        assert pedidos.brinde_do_mes(s, _ator(dados)).disponivel is True
