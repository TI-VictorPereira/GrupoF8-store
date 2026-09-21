"""Contratos do departamento."""

import uuid

from pydantic import BaseModel, ConfigDict, Field


class EntradaDepartamento(BaseModel):
    nome: str = Field(min_length=1, max_length=120)


class DepartamentoSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str
