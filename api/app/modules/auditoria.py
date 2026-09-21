"""Trilha de auditoria de negócio.
"""

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.core import contexto
from app.models.auditoria import LogAuditoria


@dataclass(frozen=True)
class Ator:
    """Quem está agindo. Parâmetro explícito de todo serviço.
    """

    id: uuid.UUID | None
    codigo: str
    nome: str
    papel: str

    @property
    def eh_admin(self) -> bool:
        return self.papel == "admin"


ATOR_CONSOLE = Ator(id=None, codigo="console", nome="Console do servidor", papel="admin")

ATOR_RELOGIO = Ator(id=None, codigo="relogio", nome="Expiração automática", papel="admin")


def registrar(
    sessao: Session,
    ator: Ator,
    *,
    acao: str,
    entidade: str,
    descricao: str,
    entidade_id: uuid.UUID | None = None,
    dados_anteriores: dict[str, Any] | None = None,
    dados_novos: dict[str, Any] | None = None,
) -> None:
    ctx = contexto.obter()
    sessao.add(
        LogAuditoria(
            usuario_id=ator.id,
            usuario_codigo=ator.codigo,
            usuario_nome=ator.nome,
            usuario_papel=ator.papel,
            acao=acao,
            entidade=entidade,
            entidade_id=entidade_id,
            descricao=descricao,
            dados_anteriores=dados_anteriores,
            dados_novos=dados_novos,
            ip=ctx.ip,
            user_agent=ctx.user_agent,
            correlacao_id=ctx.correlacao_id,
        )
    )
