"""Base declarativa e helpers de coluna."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, MetaData, Numeric, Uuid, func, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Convenção de nomes para constraints e índices. Sem isso o Alembic gera
# migrations com nomes automáticos do Postgres e o autogenerate fica instável.
CONVENCAO = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=CONVENCAO)


def pk_uuid() -> Mapped[uuid.UUID]:
    """Chave primária uuid gerada pelo Postgres (nativo desde a versão 13)."""
    return mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))


def fk_uuid(alvo: str, *, obrigatorio: bool = True, ondelete: str | None = None):
    from sqlalchemy import ForeignKey

    return mapped_column(
        Uuid,
        ForeignKey(alvo, ondelete=ondelete),
        nullable=not obrigatorio,
    )


def criado_em() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


def dinheiro(*, default: str | None = "0") -> Mapped[Decimal]:
    """numeric(10,2). Nunca float — dinheiro vira lançamento em ERP."""
    return mapped_column(
        Numeric(10, 2),
        nullable=False,
        server_default=text(default) if default is not None else None,
    )
