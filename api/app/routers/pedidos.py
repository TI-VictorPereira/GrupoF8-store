"""Rotas finas dos pedidos."""

import uuid
from datetime import date

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.core.deps import AdminLiberado, BalcaoLiberado, ConsumidorLiberado, Sessao
from app.models.operacao import ItemPedido, Pedido
from app.modules import pedidos
from app.modules.auditoria import Ator
from app.schemas.comum import Pagina
from app.schemas.pedido import (
    BrindeSaida,
    EntradaCancelamento,
    EntradaPedido,
    EntradaVendaAVisitante,
    LinhaPedidoSaida,
    PedidoDetalheSaida,
    PedidoSaida,
    PixSaida,
    VendaAVisitanteSaida,
)

rotas = APIRouter(prefix="/pedidos", tags=["pedidos"])


def _pedido_saida(pedido: Pedido, itens: list[ItemPedido], ator: Ator) -> PedidoDetalheSaida:
    saida = PedidoDetalheSaida.model_validate({**pedido.__dict__, "itens": itens})
    # Custo é margem: só o admin recebe, mesmo que a tela não mostre.
    if not ator.eh_admin:
        for item in saida.itens:
            item.custo_unitario = None
    return saida


def _detalhe(sessao: Sessao, pedido: Pedido, ator: Ator) -> PedidoDetalheSaida:
    itens = list(sessao.scalars(select(ItemPedido).where(ItemPedido.pedido_id == pedido.id)))
    return _pedido_saida(pedido, itens, ator)


def _linha_saida(linha: pedidos.LinhaPedido, ator: Ator) -> LinhaPedidoSaida:
    return LinhaPedidoSaida(
        pedido=_pedido_saida(linha.pedido, linha.itens, ator),
        colaborador_nome=linha.colaborador_nome,
        colaborador_codigo=linha.colaborador_codigo,
        departamento=linha.departamento,
        cancelado_por_nome=linha.cancelado_por_nome,
    )


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
    return [_detalhe(sessao, pedido, ator) for pedido in pedidos.listar_proprios(sessao, ator)]


@rotas.post("/visitante", response_model=VendaAVisitanteSaida, status_code=201)
def vender_a_visitante(
    dados: EntradaVendaAVisitante, ator: BalcaoLiberado, sessao: Sessao
) -> VendaAVisitanteSaida:
    itens = [
        pedidos.ItemDeVendaAVisitante(
            produto_id=item.produto_id, quantidade=item.quantidade, brinde=item.brinde
        )
        for item in dados.itens
    ]
    resultado = pedidos.vender_a_visitante(sessao, ator, dados.visitante_nome, itens)
    return VendaAVisitanteSaida(
        pedido=_detalhe(sessao, resultado.pedido, ator),
        pix=PixSaida(**vars(resultado.pix)) if resultado.pix else None,
    )


@rotas.get("/visitante", response_model=list[PedidoDetalheSaida])
def vendas_a_visitante(
    de: date, ate: date, ator: BalcaoLiberado, sessao: Sessao
) -> list[PedidoDetalheSaida]:
    """Histórico de vendas a visitante do período, pra aba própria em Vendas."""
    linhas = pedidos.listar_vendas_a_visitante(sessao, ator, de, ate)
    return [_pedido_saida(linha.pedido, linha.itens, ator) for linha in linhas]


@rotas.get("/visitante/aguardando", response_model=Pagina[PedidoDetalheSaida])
def visitantes_aguardando(
    ator: BalcaoLiberado,
    sessao: Sessao,
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(20, ge=1, le=200),
) -> Pagina[PedidoDetalheSaida]:
    """Vendas a visitante esperando o Pix, mais antigas primeiro."""
    linhas, total = pedidos.listar_visitantes_aguardando(
        sessao, ator, pagina=pagina, por_pagina=por_pagina
    )
    return Pagina(
        itens=[_pedido_saida(linha.pedido, linha.itens, ator) for linha in linhas], total=total
    )


@rotas.post("/{pedido_id}/confirmar-pix", response_model=PedidoSaida)
def confirmar_pix(pedido_id: uuid.UUID, ator: BalcaoLiberado, sessao: Sessao) -> Pedido:
    return pedidos.confirmar_pix(sessao, ator, pedido_id)


@rotas.get("/pendentes", response_model=Pagina[LinhaPedidoSaida])
def pendentes(
    ator: BalcaoLiberado,
    sessao: Sessao,
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(20, ge=1, le=200),
) -> Pagina[LinhaPedidoSaida]:
    """A fila do balcão: o que falta entregar e para quem."""
    linhas, total = pedidos.listar_pendentes_detalhado(
        sessao, ator, pagina=pagina, por_pagina=por_pagina
    )
    return Pagina(itens=[_linha_saida(linha, ator) for linha in linhas], total=total)


@rotas.get("/cancelados", response_model=Pagina[LinhaPedidoSaida])
def cancelados(
    ator: BalcaoLiberado,
    sessao: Sessao,
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(20, ge=1, le=200),
) -> Pagina[LinhaPedidoSaida]:
    """Os últimos pedidos cancelados manualmente no balcão (não os expirados)."""
    linhas, total = pedidos.listar_cancelados_detalhado(
        sessao, ator, pagina=pagina, por_pagina=por_pagina
    )
    return Pagina(itens=[_linha_saida(linha, ator) for linha in linhas], total=total)


@rotas.post("/{pedido_id}/entregar", response_model=PedidoSaida)
def entregar(pedido_id: uuid.UUID, ator: BalcaoLiberado, sessao: Sessao) -> Pedido:
    return pedidos.entregar(sessao, ator, pedido_id)


@rotas.post("/{pedido_id}/cancelar", response_model=PedidoSaida)
def cancelar(
    pedido_id: uuid.UUID, dados: EntradaCancelamento, ator: BalcaoLiberado, sessao: Sessao
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
        _linha_saida(linha, ator) for linha in pedidos.listar_periodo(sessao, ator, de, ate, status)
    ]

