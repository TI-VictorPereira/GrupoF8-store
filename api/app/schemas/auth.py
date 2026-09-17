"""Contratos de entrada e saída da autenticação.

O front é gerado a partir do OpenAPI que sai daqui, então o nome dos campos
nestes modelos é o contrato.
"""

import uuid

from pydantic import BaseModel, ConfigDict, Field


class EntradaLogin(BaseModel):
    codigo: str = Field(min_length=1, max_length=40)
    senha: str = Field(min_length=1, max_length=128)


class EntradaTrocaSenha(BaseModel):
    senha_atual: str = Field(min_length=1, max_length=128)
    senha_nova: str = Field(min_length=1, max_length=128)


class EntradaSolicitacaoSenha(BaseModel):
    codigo: str = Field(min_length=1, max_length=40)
    nome_informado: str | None = Field(default=None, max_length=160)


class EmpresaResumo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    codemp: int
    nome: str


class Eu(BaseModel):
    """Quem está logado. Não expõe hash, codparc nem nada do ERP."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome_completo: str
    codigo: str
    papel: str
    senha_provisoria: bool
    empresa: EmpresaResumo | None = None


class Mensagem(BaseModel):
    mensagem: str
