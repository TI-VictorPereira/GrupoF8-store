"""Contratos do ajuste de estoque."""

import uuid

from pydantic import BaseModel, Field


class EntradaAjusteEstoque(BaseModel):
    tipo: str = Field(pattern="^(entrada|baixa)$")
    quantidade: int = Field(gt=0, le=999_999)
    motivo: str = Field(min_length=3, max_length=300)
    colaborador_id: uuid.UUID | None = None
