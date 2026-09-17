"""Ponto de entrada da API.

Servida pelo Caddy sob /api, no mesmo domínio do front. A ausência de CORS aqui
é intencional: mesmo domínio dispensa CORS e SameSite=None.
"""

import time
import uuid

from fastapi import FastAPI, Request
from sqlalchemy import text

from app.core.config import obter_config
from app.core.db import engine
from app.core.log import configurar_log, correlacao_atual, log

config = obter_config()
configurar_log(config.log_nivel)

app = FastAPI(
    title="Loja Interna F8",
    description="Consumo interno (loja e refeitório) e exportação para o Sankhya.",
    version="0.1.0",
    root_path="/api",
    docs_url="/docs" if config.ambiente == "desenvolvimento" else None,
    redoc_url=None,
)


@app.middleware("http")
async def correlacao_e_acesso(request: Request, call_next):
    correlacao = uuid.uuid4()
    correlacao_atual.set(correlacao)
    inicio = time.perf_counter()

    resposta = await call_next(request)

    log.info(
        "requisicao",
        metodo=request.method,
        rota=request.url.path,
        status=resposta.status_code,
        ms=round((time.perf_counter() - inicio) * 1000, 1),
    )
    resposta.headers["x-correlacao-id"] = str(correlacao)
    return resposta


@app.get("/saude", tags=["infra"])
def saude() -> dict[str, str]:
    """Liveness. Não toca no banco de propósito — o container pode estar são com
    o banco fora."""
    return {"status": "ok"}


@app.get("/saude/banco", tags=["infra"])
def saude_banco() -> dict[str, str]:
    """Readiness. Serve também de ping contra o autosuspend do Neon."""
    with engine.connect() as conexao:
        conexao.execute(text("select 1"))
    return {"status": "ok", "banco": "conectado"}
