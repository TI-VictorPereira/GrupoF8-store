"""Trilha de auditoria e log de acesso.

Duas decisões que valem releitura antes de mexer aqui:

1. SEM TRIGGER. A escrita é responsabilidade do serviço, na mesma transação da
   mudança. Comportamento disparado pelo banco é invisível para quem lê o
   código do serviço.

2. Os campos de usuário são COPIADOS, não referenciados. Sem isso toda consulta
   precisa de join — e pior: se o colaborador for renomeado ou inativado, a
   trilha antiga passa a mentir sobre quem era aquela pessoa na época.
   Auditoria guarda o retrato do momento.

Append-only por convenção. Sem expurgo e sem particionamento: o volume é de
~40 MB/ano. Não há tela de consulta — a leitura é por SQL, sob demanda.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Index, String, Text, Uuid
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, criado_em, fk_uuid, pk_uuid

ACESSO_EVENTOS = (
    "login_ok",
    "login_negado",
    "bloqueado",
    "logout",
    "senha_trocada",
    "senha_solicitada",
)


class LogAuditoria(Base):
    __tablename__ = "log_auditoria"
    __table_args__ = (
        Index("ix_log_auditoria_usuario_criado", "usuario_id", "criado_em"),
        Index("ix_log_auditoria_codigo_criado", "usuario_codigo", "criado_em"),
        Index("ix_log_auditoria_criado", "criado_em"),
        Index("ix_log_auditoria_entidade", "entidade", "entidade_id", "criado_em"),
        Index("ix_log_auditoria_acao_criado", "acao", "criado_em"),
    )

    id: Mapped[uuid.UUID] = pk_uuid()
    criado_em: Mapped[datetime] = criado_em()

    # quem fez — congelado no momento do evento
    usuario_id: Mapped[uuid.UUID | None] = fk_uuid("colaboradores.id", obrigatorio=False)
    usuario_codigo: Mapped[str] = mapped_column(String(40), nullable=False)
    usuario_nome: Mapped[str] = mapped_column(String(160), nullable=False)
    usuario_papel: Mapped[str] = mapped_column(String(20), nullable=False)

    # o que fez
    acao: Mapped[str] = mapped_column(String(60), nullable=False)
    entidade: Mapped[str] = mapped_column(String(40), nullable=False)
    entidade_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    # legível sem join: "Cancelou pedido A3F9 de João Silva (R$ 12,50)"
    descricao: Mapped[str] = mapped_column(Text, nullable=False)

    # o que mudou
    dados_anteriores: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    dados_novos: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # contexto — o correlacao_id amarra este evento ao request que o causou e ao
    # log de aplicação correspondente
    ip: Mapped[str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(400), nullable=True)
    correlacao_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)


class LogAcesso(Base):
    """`codigo` é gravado mesmo quando não existe colaborador com ele.

    Tentativa de login com código inexistente é exatamente o que se quer
    enxergar — o sistema fica exposto na internet e os códigos são numéricos.
    """

    __tablename__ = "log_acesso"
    __table_args__ = (
        CheckConstraint(f"evento in {ACESSO_EVENTOS}", name="evento_valido"),
        Index("ix_log_acesso_codigo_criado", "codigo", "criado_em"),
        Index("ix_log_acesso_criado", "criado_em"),
        Index("ix_log_acesso_evento_criado", "evento", "criado_em"),
        Index("ix_log_acesso_ip_criado", "ip", "criado_em"),
    )

    id: Mapped[uuid.UUID] = pk_uuid()
    criado_em: Mapped[datetime] = criado_em()

    codigo: Mapped[str] = mapped_column(String(40), nullable=False)
    usuario_id: Mapped[uuid.UUID | None] = fk_uuid("colaboradores.id", obrigatorio=False)
    usuario_nome: Mapped[str | None] = mapped_column(String(160), nullable=True)

    evento: Mapped[str] = mapped_column(String(30), nullable=False)
    motivo: Mapped[str | None] = mapped_column(String(60), nullable=True)

    ip: Mapped[str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(400), nullable=True)
    correlacao_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
