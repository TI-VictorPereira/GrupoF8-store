"""Rotas finas dos pedidos."""

import uuid
from datetime import date

from fastapi import APIRouter
from sqlalchemy import select

from app.core.deps import AdminLiberado, ConsumidorLiberado, Sessao
from app.models.operacao import ItemPedido, Pedido
from app.modules import pedidos
from app.schemas.pedido import (
    BrindeSaida,
    EntradaCancelamento,
    EntradaPedido,
    LinhaPedidoSaida,
    PedidoDetalheSaida,
    PedidoSaida,
)

rotas = APIRouter(prefix="/pedidos", tags=["pedidos"])


def _detalhe(sessao: Sessao, pedido: Pedido) -> PedidoDetalheSaida:
    itens = list(sessao.scalars(select(ItemPedido).where(ItemPedido.pedido_id == pedido.id)))
    return PedidoDetalheSaida.model_validate({**pedido.__dict__, "itens": itens})


@rotas.post("", response_model=PedidoSaida, status_code=201)
def finalizar(dados: EntradaPedido, ator: ConsumidorLiberado, sessao: Sessao) -> Pedido:
    itens = [(item.produto_id, item.quantidade) for item in dados.itens]
    return pedidos.finalizar(sessao, ator, itens, dados.brinde_produto_id)


@rotas.get("/brinde", response_model=BrindeSaida)
def brinde(ator: ConsumidorLiberado, sessao: Sessao) -> BrindeSaida:
    """Se a pessoa pode zerar um item agora, e por que nao pode."""
    direito = pedidos.brinde_do_mes(sessao, ator)
    return BrindeSaida(**vars(direito), disponivel=direito.disponivel)


@rotas.get("/me", response_model=list[PedidoDetalheSaida])
def meus_pedidos(ator: ConsumidorLiberado, sessao: Sessao) -> list[PedidoDetalheSaida]:
    return [_detalhe(sessao, pedido) for pedido in pedidos.listar_proprios(sessao, ator)]


@rotas.get("/pendentes", response_model=list[LinhaPedidoSaida])
def pendentes(ator: AdminLiberado, sessao: Sessao) -> list[LinhaPedidoSaida]:
    """A fila do balcão: o que falta entregar e para quem."""
    return [
        LinhaPedidoSaida(
            pedido=PedidoDetalheSaida.model_validate(
                {**linha.pedido.__dict__, "itens": linha.itens}
            ),
            colaborador_nome=linha.colaborador_nome,
            colaborador_codigo=linha.colaborador_codigo,
            departamento=linha.departamento,
        )
        for linha in pedidos.listar_pendentes_detalhado(sessao, ator)
    ]


@rotas.post("/{pedido_id}/entregar", response_model=PedidoSaida)
def entregar(pedido_id: uuid.UUID, ator: AdminLiberado, sessao: Sessao) -> Pedido:
    return pedidos.entregar(sessao, ator, pedido_id)


@rotas.post("/{pedido_id}/cancelar", response_model=PedidoSaida)
def cancelar(
    pedido_id: uuid.UUID, dados: EntradaCancelamento, ator: AdminLiberado, sessao: Sessao
) -> Pedido:
    return pedidos.cancelar(sessao, ator, pedido_id, dados.motivo)


@rotas.get("", response_model=list[LinhaPedidoSaida])
def historico(
    de: date,
    ate: date,
    ator: AdminLiberado,
    sessao: Sessao,
    status: str | None = None,
) -> list[LinhaPedidoSaida]:
    """Vendas do intervalo. Base da tela de vendas e da exportação."""
    return [
        LinhaPedidoSaida(
            pedido=PedidoDetalheSaida.model_validate(
                {**linha.pedido.__dict__, "itens": linha.itens}
            ),
            colaborador_nome=linha.colaborador_nome,
            colaborador_codigo=linha.colaborador_codigo,
            departamento=linha.departamento,
        )
        for linha in pedidos.listar_periodo(sessao, ator, de, ate, status)
    ]

