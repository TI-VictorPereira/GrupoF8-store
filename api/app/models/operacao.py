"""Operação: pedidos, itens, almoços e ajustes de estoque."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, Index, Integer, String
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
        Index("ix_pedidos_colaborador_criado", "colaborador_id", "criado_em"),
        Index("ix_pedidos_status_criado", "status", "criado_em"),
    )

    id: Mapped[uuid.UUID] = pk_uuid()
    colaborador_id: Mapped[uuid.UUID] = fk_uuid("colaboradores.id")
    # Identidade congelada na criação. O colaborador muda de empresa e pode
    # mudar de vínculo; quando vira PJ, a matrícula é apagada do cadastro. Sem
    # congelar aqui, o consumo antigo seria reexportado com a identidade nova.
    # codparc não entra: identifica a pessoa e não muda com essas transições.
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

    # Idempotência da exportação. Enquanto lote_id for nulo, o pedido ainda não
    # foi para o Sankhya.
    lote_id: Mapped[uuid.UUID | None] = fk_uuid("exportacoes.id", obrigatorio=False)
    exportado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ItemPedido(Base):
    """Os campos de nome, categoria e preços são CONGELADOS no momento da compra.

    Se o produto for renomeado ou tiver o preço alterado depois, o pedido antigo
    continua contando a verdade da época — requisito de quem alimenta ERP.
    """

    __tablename__ = "itens_pedido"
    __table_args__ = (
        CheckConstraint("quantidade > 0", name="quantidade_positiva"),
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


class Almoco(Base):
    """A regra "um almoço por pessoa por dia" não está neste modelo: vive num
    índice único parcial sobre expressão, criado à mão na migration porque
    nenhum ORM o gera.

        create unique index almocos_um_por_dia
          on almocos (colaborador_id, ((criado_em at time zone 'America/Sao_Paulo')::date))
          where status in ('pendente','confirmado');

    O mesmo vale para `pedidos.codigo_retirada` único entre pendentes. Perder
    qualquer um dos dois é falha silenciosa: só aparece com dois usuários
    simultâneos.
    """

    __tablename__ = "almocos"
    __table_args__ = (
        CheckConstraint(f"status in {ALMOCO_STATUS}", name="status_valido"),
        CheckConstraint(f"origem in {ALMOCO_ORIGEM}", name="origem_valida"),
        Index("ix_almocos_colaborador_criado", "colaborador_id", "criado_em"),
        Index("ix_almocos_status_criado", "status", "criado_em"),
    )

    id: Mapped[uuid.UUID] = pk_uuid()
    colaborador_id: Mapped[uuid.UUID] = fk_uuid("colaboradores.id")
    # Identidade congelada na criação — mesmo motivo do pedido.
    empresa_id: Mapped[uuid.UUID] = fk_uuid("empresas.id")
    vinculo: Mapped[str] = mapped_column(String(10), nullable=False)
    matricula: Mapped[int | None] = mapped_column(Integer, nullable=True)
    codigo_barras: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pendente")
    origem: Mapped[str] = mapped_column(String(20), nullable=False, server_default="totem")
    # Congelado a partir de precos_almoco na hora da geração.
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
