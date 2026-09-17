"""Dados ambientais da requisição.

IP, user agent e correlação não são parâmetros de negócio — passá-los por toda
a cadeia de chamadas polui a assinatura de cada serviço. Ficam aqui, presos ao
contexto da requisição, e só quem escreve auditoria os consulta.

O ator NÃO mora aqui de propósito: ele é parâmetro explícito de todo serviço.
"""

import ipaddress
import uuid
from contextvars import ContextVar
from dataclasses import dataclass

correlacao_atual: ContextVar[uuid.UUID | None] = ContextVar("correlacao_atual", default=None)
ip_atual: ContextVar[str | None] = ContextVar("ip_atual", default=None)
user_agent_atual: ContextVar[str | None] = ContextVar("user_agent_atual", default=None)


@dataclass(frozen=True)
class ContextoRequisicao:
    correlacao_id: uuid.UUID
    ip: str | None
    user_agent: str | None


def normalizar_ip(valor: str | None) -> str | None:
    """Só devolve o que for endereço IP de verdade.

    A coluna de auditoria é `inet`, e o X-Forwarded-For é preenchido pelo
    cliente quando o proxy não o sobrescreve. Sem esta checagem, mandar
    qualquer texto naquele cabeçalho derruba a requisição com erro 500.
    """
    if not valor:
        return None
    try:
        return str(ipaddress.ip_address(valor.strip()))
    except ValueError:
        return None


def definir(correlacao_id: uuid.UUID, ip: str | None, user_agent: str | None) -> None:
    correlacao_atual.set(correlacao_id)
    ip_atual.set(normalizar_ip(ip))
    # Truncado no tamanho da coluna: user agent também vem do cliente.
    user_agent_atual.set(user_agent[:400] if user_agent else None)


def obter() -> ContextoRequisicao:
    correlacao = correlacao_atual.get()
    if correlacao is None:
        # Fora de requisição (teste, script, tarefa) ainda precisa de um valor:
        # auditoria sem correlação não pode existir.
        correlacao = uuid.uuid4()
        correlacao_atual.set(correlacao)
    return ContextoRequisicao(
        correlacao_id=correlacao,
        ip=ip_atual.get(),
        user_agent=user_agent_atual.get(),
    )
