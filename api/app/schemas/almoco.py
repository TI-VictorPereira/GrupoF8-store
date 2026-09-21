"""Contratos do almoço."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class EntradaConfirmacaoAlmoco(BaseModel):
    codigo_barras: str = Field(min_length=1, max_length=40)


class EntradaAlmocoManual(BaseModel):
    colaborador_id: uuid.UUID


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


class LinhaPainelSaida(BaseModel):
    """Linha do painel do refeitório: o almoço mais quem é a pessoa.

    O nome vem por join e não está congelado no almoço — para o painel
    interessa quem a pessoa é agora, não quem era no momento da geração.
    """

    almoco: AlmocoSaida
    colaborador_nome: str
    colaborador_codigo: str
    departamento: str | None
