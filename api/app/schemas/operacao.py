"""Contratos HTTP dos fluxos de pedido, almoço e estoque."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ItemDeCompra(BaseModel):
    produto_id: uuid.UUID
    quantidade: int = Field(gt=0, le=999)


class EntradaPedido(BaseModel):
    itens: list[ItemDeCompra] = Field(min_length=1, max_length=100)


class ItemPedidoSaida(BaseModel):
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


class EntradaCancelamento(BaseModel):
    motivo: str = Field(min_length=3, max_length=300)


class EntradaAjusteEstoque(BaseModel):
    tipo: str = Field(pattern="^(entrada|baixa)$")
    quantidade: int = Field(gt=0, le=999_999)
    motivo: str = Field(min_length=3, max_length=300)


class ProdutoSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str
    codigo: str
    estoque: int
    ativo: bool
    custo: Decimal
    preco_venda: Decimal


class AlmocoSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    colaborador_id: uuid.UUID
    codigo_barras: str
    status: str
    origem: str
    valor: Decimal
    criado_em: datetime
    expira_em: datetime
    confirmado_em: datetime | None
    confirmado_por: uuid.UUID | None


class EntradaConfirmacaoAlmoco(BaseModel):
    codigo_barras: str = Field(min_length=1, max_length=40)


class EntradaAlmocoManual(BaseModel):
    colaborador_id: uuid.UUID


class LinhaPainelSaida(BaseModel):
    """Linha do painel do refeitório: o almoço mais quem é a pessoa.

   
    """

    almoco: AlmocoSaida
    colaborador_nome: str
    colaborador_codigo: str
    departamento: str | None


class ColaboradorParaAlmocoSaida(BaseModel):
    """O mínimo para o painel identificar a pessoa no lançamento manual."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome_completo: str
    codigo: str
    departamento: str | None


class LinhaPedidoSaida(BaseModel):
    """Linha da tela de entregas: o pedido mais quem vem retirar."""

    pedido: PedidoDetalheSaida
    colaborador_nome: str
    colaborador_codigo: str
    departamento: str | None
