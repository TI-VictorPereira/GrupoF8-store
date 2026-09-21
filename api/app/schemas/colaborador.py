"""Contratos do colaborador, incluindo senha provisória e importação."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


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
    """Para o admin. Nunca inclui hash de senha nem o corte de sessão."""

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


class ColaboradorResumo(BaseModel):
    """O mínimo para identificar alguém: nome, código e departamento.

    Existe separado de `ColaboradorSaida` porque o refeitório precisa achar a
    pessoa para lançar um almoço, não conhecer o cadastro dela. Sem codparc,
    matrícula, papel nem empresa.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome_completo: str
    codigo: str
    departamento: str | None


class ColaboradorComSenha(BaseModel):
    """A senha provisória aparece uma única vez, na resposta que a gerou.

    Depois disso só existe o hash — se o admin perder, o caminho é redefinir
    de novo, não recuperar.
    """

    colaborador: ColaboradorSaida
    senha_provisoria: str


class SenhaRedefinida(BaseModel):
    codigo: str
    senha_provisoria: str


class EntradaImportacao(BaseModel):
    linhas: list[EntradaColaborador] = Field(min_length=1, max_length=500)


class ResultadoImportacaoSaida(BaseModel):
    criados: int
    senhas: dict[str, str]
    erros: list[str]


class SolicitacaoSaida(BaseModel):
    """Pedido de senha aberto na tela de login, para o admin atender."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    codigo: str
    nome_informado: str | None
    criado_em: datetime
