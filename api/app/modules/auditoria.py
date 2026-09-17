"""Trilha de auditoria de negócio.

Não há trigger: quem registra é o serviço, sempre na MESMA sessão da mudança.
Como o commit acontece só na borda da requisição, o registro e o fato que ele
descreve caem juntos ou não caem — que é exatamente o desejado, porque este log
descreve uma MUDANÇA.

O log de ACESSO segue a regra oposta e mora em `app/modules/auth/registro.py`:
ele descreve uma tentativa e precisa sobreviver ao rollback da falha.
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

    Substitui a RLS do Postgres, que protegia mesmo quando alguém esquecia o
    filtro — por isso autorização aqui só vale acompanhada de teste.
    """

    id: uuid.UUID
    codigo: str
    nome: str
    papel: str

    @property
    def eh_admin(self) -> bool:
        return self.papel == "admin"


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


