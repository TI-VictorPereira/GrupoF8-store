"""Contratos do produto e da categoria.

Duas saídas, e a diferença é deliberada: `ProdutoVitrine` não tem custo,
porque margem não é assunto de quem está comprando.
"""

import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class CategoriaSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str


class EntradaProduto(BaseModel):
    nome: str = Field(min_length=1, max_length=160)
    codigo: str = Field(min_length=1, max_length=40)
    preco_venda: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    custo: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    categoria_id: uuid.UUID | None = None
    foto_url: str | None = Field(default=None, max_length=500)


class ProdutoCompleto(BaseModel):
    """Para o admin: tudo, inclusive custo."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str
    codigo: str
    categoria_id: uuid.UUID | None
    custo: Decimal
    preco_venda: Decimal
    estoque: int
    foto_url: str | None
    ativo: bool


class ProdutoVitrine(BaseModel):
    """Para o colaborador. Sem custo — margem não é assunto dele."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str
    categoria_id: uuid.UUID | None
    preco_venda: Decimal
    estoque: int
    foto_url: str | None


class LinhaImportacaoProduto(BaseModel):
    """Uma linha da planilha. Só o código é obrigatório.

    Campo ausente significa "não mexer": dá para mandar só código e preço
    para um reajuste, sem zerar o resto do cadastro.
    """

    codigo: str = Field(min_length=1, max_length=40)
    nome: str | None = Field(default=None, max_length=160)
    categoria: str | None = Field(default=None, max_length=120)
    custo: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    preco_venda: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    estoque: int | None = Field(default=None, ge=0, le=999_999)
    ativo: bool | None = None


class EntradaImportacaoProduto(BaseModel):
    linhas: list[LinhaImportacaoProduto] = Field(min_length=1, max_length=500)


class ResultadoImportacaoProdutoSaida(BaseModel):
    criados: int
    atualizados: int
    erros: list[str]
