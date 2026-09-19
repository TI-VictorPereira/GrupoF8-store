"""Rotas finas dos pedidos."""

import uuid

from fastapi import APIRouter
from sqlalchemy import select

from app.core.deps import AdminLiberado, AtorLiberado, Sessao
from app.models.operacao import ItemPedido, Pedido
from app.modules import pedidos
from app.schemas.operacao import (
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
def finalizar(dados: EntradaPedido, ator: AtorLiberado, sessao: Sessao) -> Pedido:
    itens = [(item.produto_id, item.quantidade) for item in dados.itens]
    return pedidos.finalizar(sessao, ator, itens)


@rotas.get("/me", response_model=list[PedidoDetalheSaida])
def meus_pedidos(ator: AtorLiberado, sessao: Sessao) -> list[PedidoDetalheSaida]:
    return [_detalhe(sessao, pedido) for pedido in pedidos.listar_proprios(sessao, ator)]


@rotas.get("/pendentes", response_model=list[LinhaPedidoSaida])
def pendentes(ator: AdminLiberado, sessao: Sessao) -> list[LinhaPedidoSaida]:
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
