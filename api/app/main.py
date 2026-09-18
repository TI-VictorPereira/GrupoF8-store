"""Ponto de entrada da API.

Servida pelo Caddy sob /api, no mesmo domínio do front. A ausência de CORS aqui
é intencional: mesmo domínio dispensa CORS e SameSite=None.
"""

import time
import uuid

from fastapi import FastAPI, Request
from sqlalchemy import text

from app.core import contexto
from app.core.config import obter_config
from app.core.db import engine
from app.core.log import configurar_log, log
from app.excecoes import handlers
from app.routers import almocos, auth, colaboradores, estoque, pedidos, produtos

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
    # Atrás do Caddy e do Cloudflare, request.client é o proxy — o IP real vem
    # no cabeçalho. Por isso o proxy TEM de sobrescrever o X-Forwarded-For:
    # se ele apenas repassar, qualquer cliente forja o próprio IP e escapa do
    # limite por tentativa. Se o cabeçalho vier inválido, cai no cliente real.
    encaminhado = (request.headers.get("x-forwarded-for") or "").split(",")[0]
    contexto.definir(
        correlacao_id=correlacao,
        ip=contexto.normalizar_ip(encaminhado) or (request.client.host if request.client else None),
        user_agent=request.headers.get("user-agent"),
    )
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


handlers.registrar(app)
app.include_router(auth.rotas)
app.include_router(pedidos.rotas)
app.include_router(almocos.rotas)
app.include_router(estoque.rotas)
app.include_router(produtos.rotas)
app.include_router(colaboradores.rotas)


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
