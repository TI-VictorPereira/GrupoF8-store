"""Contratos usados por mais de uma entidade."""

from pydantic import BaseModel


class Mensagem(BaseModel):
    """Resposta de operação que não devolve recurso."""

    mensagem: str


class EntradaAtivo(BaseModel):
    """Ativar/inativar. Serve a empresa, colaborador e produto — nenhum deles
    é apagado, todos são desligados."""

    ativo: bool
