"""Contratos da autenticação.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.empresa import EmpresaResumo


class EntradaLogin(BaseModel):
    codigo: str = Field(min_length=1, max_length=40)
    senha: str = Field(min_length=1, max_length=128)


class EntradaTrocaSenha(BaseModel):
    senha_atual: str = Field(min_length=1, max_length=128)
    senha_nova: str = Field(min_length=1, max_length=128)


class CorteCicloSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    dia: int
    primeira_competencia: str
    vigente_desde: datetime


class Eu(BaseModel):
    """Quem está logado. Não expõe hash, codparc nem nada do ERP.

    Leva as regras de corte junto: toda tela que mostra ciclo precisa delas, e
    a sessão é a única coisa resolvida antes de qualquer tela montar."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome_completo: str
    codigo: str
    papel: str
    senha_provisoria: bool
    termos_pendentes: bool
    empresa: EmpresaResumo | None = None
    cortes_ciclo: list[CorteCicloSaida] = []


class SecaoTermosSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    titulo: str
    paragrafos: list[str]


class TermosSaida(BaseModel):
    versao: str
    secoes: list[SecaoTermosSaida]
