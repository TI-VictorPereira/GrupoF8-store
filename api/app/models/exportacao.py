"""Lote de exportação para o Sankhya.

O lote é entidade de primeira classe, não um botão que gera arquivo. É o que dá
idempotência: sem `lote_id` marcado nos pedidos e almoços, um mês entra duas
vezes no ERP e ninguém percebe até o fechamento contábil.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, criado_em, fk_uuid, pk_uuid

LOTE_STATUS = ("aberta", "fechada", "exportada", "descartada")


class Exportacao(Base):
    __tablename__ = "exportacoes"
    __table_args__ = (
        CheckConstraint(f"status in {LOTE_STATUS}", name="status_valido"),
    )

    id: Mapped[uuid.UUID] = pk_uuid()
    competencia: Mapped[str] = mapped_column(String(7), nullable=False)  # 'AAAA-MM'
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="aberta")

    criado_em: Mapped[datetime] = criado_em()
    criado_por: Mapped[uuid.UUID | None] = fk_uuid("colaboradores.id", obrigatorio=False)
    fechado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    exportado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    arquivo_caminho: Mapped[str | None] = mapped_column(String(500), nullable=True)
    total_registros: Mapped[int | None] = mapped_column(Integer, nullable=True)
    valor_total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    # Uma competência ativa por vez: índice único parcial
    # (where status <> 'descartada'), criado na migration.
