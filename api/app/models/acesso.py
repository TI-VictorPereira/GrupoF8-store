"""Apoio ao login: contador de bloqueio e pedidos de nova senha.

O HISTÓRICO de acesso não mora aqui — vai em `log_acesso`. Esta tabela é só o
caminho rápido do bloqueio e zera a cada acerto.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, criado_em, fk_uuid, pk_uuid

SOLICITACAO_STATUS = ("aberta", "atendida", "descartada")


class TentativaLogin(Base):
    __tablename__ = "tentativas_login"

    codigo: Mapped[str] = mapped_column(String(40), primary_key=True)
    tentativas: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    bloqueado_ate: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TentativaIp(Base):
    """Janela deslizante de tentativas por IP.

    Fica no banco, e não em memória do processo, porque memória de processo não
    é compartilhada entre os workers do uvicorn nem sobrevive a um deploy — o
    limite efetivo viraria o dobro do configurado e zeraria a cada subida.

    Não justifica um Redis: com 100 pessoas isso é um punhado de escritas por
    dia, e a barreira de verdade contra varredura é a regra de rate limiting do
    Cloudflare, antes da requisição chegar aqui.

    Sem coluna de bloqueio: quando a janela expira, a contagem reinicia sozinha.
    """

    __tablename__ = "tentativas_ip"

    ip: Mapped[str] = mapped_column(INET, primary_key=True)
    tentativas: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    janela_inicio: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class SolicitacaoSenha(Base):
    __tablename__ = "solicitacoes_senha"
    __table_args__ = (
        CheckConstraint(f"status in {SOLICITACAO_STATUS}", name="status_valido"),
        Index("ix_solicitacoes_senha_status_criado", "status", "criado_em"),
    )

    id: Mapped[uuid.UUID] = pk_uuid()
    codigo: Mapped[str] = mapped_column(String(40), nullable=False)
    nome_informado: Mapped[str | None] = mapped_column(String(160), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="aberta")
    criado_em: Mapped[datetime] = criado_em()
    atendido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    atendido_por: Mapped[uuid.UUID | None] = fk_uuid("colaboradores.id", obrigatorio=False)
