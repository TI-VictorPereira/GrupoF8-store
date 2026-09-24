"""Expiração sob demanda, para hospedagem sem processo de fundo.

O VPS tem o serviço `relogio` rodando em laço (ver docker-compose.prod.yml).
Serverless não tem onde manter um laço, então esta rota existe para um
agendador externo bater nela — Vercel Cron, GitHub Actions com `schedule`, ou
qualquer outro. A lógica é a mesma do script `app.scripts.relogio`: as duas
não podem divergir, ou as duas formas de hospedar passam a expirar coisas
diferentes.

Autenticação por segredo compartilhado, não por login: quem chama aqui é uma
máquina, sem sessão. Comparação em tempo constante para não vazar o segredo
por quanto tempo a resposta demora a chegar.
"""

import hmac

from fastapi import APIRouter, Header

from app.core.config import obter_config
from app.core.deps import Sessao
from app.excecoes import NaoAutenticado
from app.modules import almocos, pedidos

rotas = APIRouter(prefix="/relogio", tags=["infra"])


def _autenticar(autorizacao: str | None) -> None:
    config = obter_config()
    se_enviado = (autorizacao or "").removeprefix("Bearer ").strip()
    # Sem segredo configurado, a rota fica fechada por padrão — não aberta.
    # Um cron secret vazio nunca deve significar "qualquer um pode chamar".
    if not config.cron_secret or not hmac.compare_digest(se_enviado, config.cron_secret):
        raise NaoAutenticado()


@rotas.post("/expirar")
def expirar(sessao: Sessao, authorization: str | None = Header(default=None)) -> dict[str, int]:
    """O commit é o de sempre: acontece na borda da requisição, em `sessao()`."""
    _autenticar(authorization)
    vencidos = pedidos.expirar_vencidos(sessao)
    almocos_vencidos = almocos.expirar_vencidos(sessao)
    return {"pedidos_expirados": len(vencidos), "almocos_expirados": almocos_vencidos}
