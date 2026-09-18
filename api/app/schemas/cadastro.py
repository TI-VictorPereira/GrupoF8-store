"""Contratos de cadastro: colaboradores, produtos e solicitações de senha."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


# ----------------------------------------------------------------- referências


class EmpresaSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    codemp: int
    nome: str
    ativo: bool


class DepartamentoSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str


class CategoriaSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str


# --------------------------------------------------------------- colaboradores


class EntradaColaborador(BaseModel):
    nome_completo: str = Field(min_length=1, max_length=160)
    codigo: str = Field(min_length=1, max_length=40)
    codparc: int = Field(gt=0)
    empresa_id: uuid.UUID
    vinculo: str = Field(default="clt", pattern="^(clt|pj)$")
    matricula: int | None = Field(default=None, gt=0)
    papel: str = Field(default="colaborador", pattern="^(colaborador|refeitorio|admin)$")
    departamento_id: uuid.UUID | None = None


class ColaboradorSaida(BaseModel):
    """Nunca inclui hash de senha nem o corte de sessão."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome_completo: str
    codigo: str
    codparc: int
    vinculo: str
    matricula: int | None
    empresa_id: uuid.UUID
    papel: str
    departamento_id: uuid.UUID | None
    ativo: bool
    senha_provisoria: bool
    criado_em: datetime


class ColaboradorComSenha(BaseModel):
    """A senha provisória aparece uma única vez, na resposta que a gerou.

    Depois disso só existe o hash — se o admin perder, o caminho é redefinir de
    novo, não recuperar.
    """

    colaborador: ColaboradorSaida
    senha_provisoria: str


class EntradaImportacao(BaseModel):
    linhas: list[EntradaColaborador] = Field(min_length=1, max_length=500)


class ResultadoImportacaoSaida(BaseModel):
    criados: int
    senhas: dict[str, str]
    erros: list[str]


class EntradaAtivo(BaseModel):
    ativo: bool


class SolicitacaoSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    codigo: str
    nome_informado: str | None
    criado_em: datetime


class SenhaRedefinida(BaseModel):
    codigo: str
    senha_provisoria: str


# -------------------------------------------------------------------- produtos


class EntradaProduto(BaseModel):
    nome: str = Field(min_length=1, max_length=160)
    codigo: str = Field(min_length=1, max_length=40)
    preco_venda: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    custo: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    categoria_id: uuid.UUID | None = None
    foto_url: str | None = Field(default=None, max_length=500)


class ProdutoCompleto(BaseModel):
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
    """O que o colaborador vê. Sem custo — margem não é assunto dele."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str
    categoria_id: uuid.UUID | None
    preco_venda: Decimal
    estoque: int
    foto_url: str | None
