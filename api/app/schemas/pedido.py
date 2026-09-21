"""Contratos do pedido da loja."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ItemDeCompra(BaseModel):
    produto_id: uuid.UUID
    quantidade: int = Field(gt=0, le=999)


class EntradaPedido(BaseModel):
    itens: list[ItemDeCompra] = Field(min_length=1, max_length=100)


class EntradaCancelamento(BaseModel):
    motivo: str = Field(min_length=3, max_length=300)


class ItemPedidoSaida(BaseModel):
    """Retrato do item no momento da compra, não o produto atual.

    Não tem `id` de propósito: para quem lê o pedido, a linha não é um
    recurso próprio — mudar o preço do produto amanhã não pode mexer no que
    esta pessoa pagou hoje.
    """

    model_config = ConfigDict(from_attributes=True)

    produto_id: uuid.UUID | None
    nome_produto: str
    categoria: str | None
    quantidade: int
    preco_unitario: Decimal
    custo_unitario: Decimal


class PedidoSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    colaborador_id: uuid.UUID
    valor_total: Decimal
    status: str
    codigo_retirada: str
    criado_em: datetime
    entregue_em: datetime | None
    entregue_por: uuid.UUID | None
    cancelado_em: datetime | None
    motivo_cancelamento: str | None


class PedidoDetalheSaida(PedidoSaida):
    itens: list[ItemPedidoSaida]


class LinhaPedidoSaida(BaseModel):
    """Linha da tela de entregas: o pedido mais quem vem retirar.

    O nome vem por join e não está congelado no pedido — para o balcão
    interessa quem a pessoa é agora, não quem era na hora da compra.
    """

    pedido: PedidoDetalheSaida
    colaborador_nome: str
    colaborador_codigo: str
    departamento: str | None


class EntradaEntrega(BaseModel):
    """O código que a pessoa mostra no balcão. Seis dígitos."""

    codigo_retirada: str = Field(min_length=1, max_length=20)


class PedidoParaEntregaSaida(BaseModel):
    """O pedido como o balcão pode vê-lo: sem o código de retirada.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    colaborador_id: uuid.UUID
    valor_total: Decimal
    status: str
    criado_em: datetime
    itens: list[ItemPedidoSaida]


class LinhaEntregaSaida(BaseModel):
    """Linha da tela de entregas."""

    pedido: PedidoParaEntregaSaida
    colaborador_nome: str
    colaborador_codigo: str
    departamento: str | None
