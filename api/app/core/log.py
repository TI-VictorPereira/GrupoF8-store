"""Log de aplicação: JSON estruturado em stdout.

Esta é a TERCEIRA camada de log do sistema, e a única que NÃO vai para o banco.
As outras duas (log_auditoria e log_acesso) são dado de negócio.

A regra que separa: se um contador ou auditor pode perguntar, vai no banco. Se é
um desenvolvedor depurando, vai aqui.

NUNCA registrar aqui: senha, hash, token, cookie de sessão e — específico deste
sistema — o CÓDIGO DE BARRAS COMPLETO do almoço. Aquele código é um token ao
portador: quem tem o número consegue um almoço. Registrar só os últimos dígitos.
"""

import logging
import sys

import structlog

from app.core.contexto import correlacao_atual


def _injetar_correlacao(_logger, _metodo, evento: dict) -> dict:
    valor = correlacao_atual.get()
    if valor is not None:
        evento["correlacao_id"] = str(valor)
    return evento


def configurar_log(nivel: str = "INFO") -> None:
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=nivel)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            _injetar_correlacao,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelNamesMapping()[nivel]
        ),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


log = structlog.get_logger()
