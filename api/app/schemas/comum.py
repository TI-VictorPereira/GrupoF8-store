"""Contratos usados por mais de uma entidade."""

from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Mensagem(BaseModel):
    """Resposta de operação que não devolve recurso."""

    mensagem: str


class Pagina(BaseModel, Generic[T]):
    """Envelope de listagem paginada. `total` é a contagem real no banco,
    não o tamanho de `itens` — é o que permite calcular quantas páginas existem."""

    itens: list[T]
    total: int


class EntradaAtivo(BaseModel):
    """Ativar/inativar. Serve a empresa, colaborador e produto — nenhum deles
    é apagado, todos são desligados."""

    ativo: bool
