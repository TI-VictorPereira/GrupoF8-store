"""Operação: pedidos, itens, almoços e ajustes de estoque."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, criado_em, dinheiro, fk_uuid, pk_uuid

PEDIDO_STATUS = ("pendente", "entregue", "cancelado")
ALMOCO_STATUS = ("pendente", "confirmado", "expirado", "cancelado")
ALMOCO_ORIGEM = ("totem", "manual")
AJUSTE_TIPO = ("entrada", "baixa")


class Pedido(Base):
    __tablename__ = "pedidos"
    __table_args__ = (
        CheckConstraint(f"status in {PEDIDO_STATUS}", name="status_valido"),
        CheckConstraint("valor_total >= 0", name="valor_nao_negativo"),
        Index("ix_pedidos_colaborador_criado", "colaborador_id", "criado_em"),
        Index("ix_pedidos_status_criado", "status", "criado_em"),
    )

    id: Mapped[uuid.UUID] = pk_uuid()
    colaborador_id: Mapped[uuid.UUID] = fk_uuid("colaboradores.id")
    empresa_id: Mapped[uuid.UUID] = fk_uuid("empresas.id")
    vinculo: Mapped[str] = mapped_column(String(10), nullable=False)
    matricula: Mapped[int | None] = mapped_column(Integer, nullable=True)
    valor_total: Mapped[Decimal] = dinheiro()
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pendente")
    codigo_retirada: Mapped[str] = mapped_column(String(20), nullable=False)
    criado_em: Mapped[datetime] = criado_em()
    entregue_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    entregue_por: Mapped[uuid.UUID | None] = fk_uuid("colaboradores.id", obrigatorio=False)
    cancelado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    motivo_cancelamento: Mapped[str | None] = mapped_column(String(300), nullable=True)
    lote_id: Mapped[uuid.UUID | None] = fk_uuid("exportacoes.id", obrigatorio=False)
    exportado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ItemPedido(Base):

    __tablename__ = "itens_pedido"
    __table_args__ = (
        CheckConstraint("quantidade > 0", name="quantidade_positiva"),
        CheckConstraint("preco_unitario >= 0", name="preco_nao_negativo"),
        CheckConstraint("custo_unitario >= 0", name="custo_nao_negativo"),
    )

    id: Mapped[uuid.UUID] = pk_uuid()
    pedido_id: Mapped[uuid.UUID] = fk_uuid("pedidos.id", ondelete="CASCADE")
    produto_id: Mapped[uuid.UUID | None] = fk_uuid(
        "produtos.id", obrigatorio=False, ondelete="SET NULL"
    )
    nome_produto: Mapped[str] = mapped_column(String(160), nullable=False)
    categoria: Mapped[str | None] = mapped_column(String(120), nullable=True)
    quantidade: Mapped[int] = mapped_column(Integer, nullable=False)
    preco_unitario: Mapped[Decimal] = dinheiro(default=None)
    custo_unitario: Mapped[Decimal] = dinheiro(default=None)
    brinde: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")


class Almoco(Base):

    __tablename__ = "almocos"
    __table_args__ = (
        CheckConstraint(f"status in {ALMOCO_STATUS}", name="status_valido"),
        CheckConstraint(f"origem in {ALMOCO_ORIGEM}", name="origem_valida"),
        CheckConstraint("valor >= 0", name="valor_nao_negativo"),
        Index("ix_almocos_colaborador_criado", "colaborador_id", "criado_em"),
        Index("ix_almocos_status_criado", "status", "criado_em"),
    )

    id: Mapped[uuid.UUID] = pk_uuid()
    colaborador_id: Mapped[uuid.UUID] = fk_uuid("colaboradores.id")
    empresa_id: Mapped[uuid.UUID] = fk_uuid("empresas.id")
    vinculo: Mapped[str] = mapped_column(String(10), nullable=False)
    matricula: Mapped[int | None] = mapped_column(Integer, nullable=True)
    codigo_barras: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pendente")
    origem: Mapped[str] = mapped_column(String(20), nullable=False, server_default="totem")
    valor: Mapped[Decimal] = dinheiro()
    criado_em: Mapped[datetime] = criado_em()
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    confirmado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confirmado_por: Mapped[uuid.UUID | None] = fk_uuid("colaboradores.id", obrigatorio=False)

    lote_id: Mapped[uuid.UUID | None] = fk_uuid("exportacoes.id", obrigatorio=False)
    exportado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AjusteEstoque(Base):
    __tablename__ = "ajustes_estoque"
    __table_args__ = (
        CheckConstraint(f"tipo in {AJUSTE_TIPO}", name="tipo_valido"),
        CheckConstraint("quantidade > 0", name="quantidade_positiva"),
        Index("ix_ajustes_estoque_produto_criado", "produto_id", "criado_em"),
    )

    id: Mapped[uuid.UUID] = pk_uuid()
    produto_id: Mapped[uuid.UUID] = fk_uuid("produtos.id")
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    quantidade: Mapped[int] = mapped_column(Integer, nullable=False)
    motivo: Mapped[str] = mapped_column(String(300), nullable=False)
    criado_por: Mapped[uuid.UUID | None] = fk_uuid("colaboradores.id", obrigatorio=False)
    criado_em: Mapped[datetime] = criado_em()
