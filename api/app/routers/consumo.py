"""Extrato de consumo do próprio colaborador."""

import uuid
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.deps import AtorLiberado, Sessao
from app.modules import consumo

rotas = APIRouter(prefix="/consumo", tags=["consumo"])


class LancamentoSaida(BaseModel):
    id: uuid.UUID
    tipo: str
    data: datetime
    descricao: str
    valor: Decimal
    status: str


class ExtratoSaida(BaseModel):
    competencia: str
    total_loja: Decimal
    total_almocos: Decimal
    quantidade_almocos: int
    lancamentos: list[LancamentoSaida]


@rotas.get("/me", response_model=ExtratoSaida)
def meu_extrato(ator: AtorLiberado, sessao: Sessao, competencia: str | None = None) -> ExtratoSaida:
    """Sempre do próprio ator: não há como pedir o extrato de outra pessoa."""
    extrato = consumo.meu_extrato(sessao, ator, competencia)
    return ExtratoSaida(
        competencia=extrato.competencia,
        total_loja=extrato.total_loja,
        total_almocos=extrato.total_almocos,
        quantidade_almocos=extrato.quantidade_almocos,
        lancamentos=[LancamentoSaida(**vars(lancamento)) for lancamento in extrato.lancamentos],
    )


@rotas.get("/competencias", response_model=list[str])
def competencias(ator: AtorLiberado, sessao: Sessao) -> list[str]:
    return consumo.competencias_disponiveis(sessao, ator)
