"""Contratos da autenticação.
"""

import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.empresa import EmpresaResumo


class EntradaLogin(BaseModel):
    codigo: str = Field(min_length=1, max_length=40)
    senha: str = Field(min_length=1, max_length=128)


class EntradaTrocaSenha(BaseModel):
    senha_atual: str = Field(min_length=1, max_length=128)
    senha_nova: str = Field(min_length=1, max_length=128)


class EntradaSolicitacaoSenha(BaseModel):
    codigo: str = Field(min_length=1, max_length=40)
    nome_informado: str | None = Field(default=None, max_length=160)


class Eu(BaseModel):
    """Quem está logado. Não expõe hash, codparc nem nada do ERP."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome_completo: str
    codigo: str
    papel: str
    senha_provisoria: bool
    empresa: EmpresaResumo | None = None
