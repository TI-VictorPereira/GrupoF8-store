"""Contratos da empresa.
"""

import uuid

from pydantic import BaseModel, ConfigDict, Field


class EntradaEmpresa(BaseModel):
    codemp: int = Field(gt=0, description="Código da empresa no Sankhya")
    nome: str = Field(min_length=1, max_length=160)


class EmpresaSaida(BaseModel):
    """Para o admin."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    codemp: int
    nome: str
    ativo: bool


class EmpresaResumo(BaseModel):
    """Para o colaborador, dentro da sessão."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    codemp: int
    nome: str
