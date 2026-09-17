"""Tradução de exceção para resposta HTTP.

Três caminhos, uma forma de resposta só:

- ErroDaAplicacao  -> o código e o status que a própria exceção declara
- RequestValidationError (Pydantic) -> 422 com o campo que falhou
- Exception não prevista -> 500 genérico, SEM detalhe

O 500 é o único caso em que a resposta esconde informação de propósito: stack
trace e mensagem de driver vazam nome de tabela, caminho de arquivo e às vezes
valor de parâmetro. O detalhe vai para o log, e o usuário recebe o
correlacao_id para a gente achar lá.
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core import contexto
from app.core.log import log
from app.excecoes.base import ErroDaAplicacao


def registrar(app: FastAPI) -> None:
    @app.exception_handler(ErroDaAplicacao)
    async def _erro_previsto(_: Request, erro: ErroDaAplicacao) -> JSONResponse:
        correlacao = str(contexto.obter().correlacao_id)
        log.info("erro_previsto", codigo=erro.codigo, status=erro.status)
        return JSONResponse(status_code=erro.status, content=erro.corpo(correlacao))

    @app.exception_handler(RequestValidationError)
    async def _erro_de_validacao(_: Request, erro: RequestValidationError) -> JSONResponse:
        correlacao = str(contexto.obter().correlacao_id)
        campos = [
            {"campo": ".".join(str(p) for p in e["loc"][1:]), "problema": e["msg"]}
            for e in erro.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={
                "codigo": "dados_invalidos",
                "mensagem": "Dados inválidos.",
                "detalhes": {"campos": campos},
                "correlacao_id": correlacao,
            },
        )

    @app.exception_handler(Exception)
    async def _erro_inesperado(_: Request, erro: Exception) -> JSONResponse:
        correlacao = str(contexto.obter().correlacao_id)
        log.exception("erro_inesperado", erro=type(erro).__name__)
        return JSONResponse(
            status_code=500,
            content={
                "codigo": "erro_interno",
                "mensagem": "Erro inesperado. Informe o código abaixo ao suporte.",
                "correlacao_id": correlacao,
            },
        )
