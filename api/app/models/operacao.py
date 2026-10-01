"""Operação: pedidos, itens, almoços e ajustes de estoque."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, criado_em, dinheiro, fk_uuid, pk_uuid

PEDIDO_STATUS = ("pendente", "entregue", "cancelado", "aguardando_pagamento")
ALMOCO_STATUS = ("pendente", "confirmado", "expirado", "cancelado")
ALMOCO_ORIGEM = ("totem", "manual", "visitante")
AJUSTE_TIPO = ("entrada", "baixa")


class Pedido(Base):
    __tablename__ = "pedidos"
    __table_args__ = (
        CheckConstraint(f"status in {PEDIDO_STATUS}", name="status_valido"),
        CheckConstraint("valor_total >= 0", name="valor_nao_negativo"),
        # Visitante não tem cadastro de colaborador — um pedido é de um jeito
        # ou do outro, nunca dos dois nem de nenhum. Mesma regra do Almoco.
        CheckConstraint(
            "(colaborador_id is not null) != (visitante_nome is not null)",
            name="colaborador_xor_visitante",
        ),
        Index("ix_pedidos_colaborador_criado", "colaborador_id", "criado_em"),
        Index("ix_pedidos_status_criado", "status", "criado_em"),
    )

    id: Mapped[uuid.UUID] = pk_uuid()
    colaborador_id: Mapped[uuid.UUID | None] = fk_uuid("colaboradores.id", obrigatorio=False)
    empresa_id: Mapped[uuid.UUID | None] = fk_uuid("empresas.id", obrigatorio=False)
    vinculo: Mapped[str | None] = mapped_column(String(10), nullable=True)
    matricula: Mapped[int | None] = mapped_column(Integer, nullable=True)
    visitante_nome: Mapped[str | None] = mapped_column(String(160), nullable=True)
    valor_total: Mapped[Decimal] = dinheiro()
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pendente")
    codigo_retirada: Mapped[str] = mapped_column(String(20), nullable=False)
    # Só existe quando a venda foi a visitante e teve algo a pagar — não é
    # gerado pra compra de colaborador (paga em folha) nem pra venda 100%
    # cortesia (nada a cobrar).
    pix_txid: Mapped[str | None] = mapped_column(String(20), nullable=True)
    pix_confirmado_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    criado_em: Mapped[datetime] = criado_em()
    entregue_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    entregue_por: Mapped[uuid.UUID | None] = fk_uuid("colaboradores.id", obrigatorio=False)
    cancelado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    motivo_cancelamento: Mapped[str | None] = mapped_column(String(300), nullable=True)
    # Nulo quando o cancelamento foi automático (expiração pelo relógio) —
    # é o que distingue "admin cancelou" de "expirou sozinho" sem precisar de
    # um status novo. Espelha `entregue_por`.
    cancelado_por: Mapped[uuid.UUID | None] = fk_uuid("colaboradores.id", obrigatorio=False)
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
        # Visitante não tem colaborador cadastrado — um almoço é de um jeito ou
        # do outro, nunca dos dois nem de nenhum.
        CheckConstraint(
            "(colaborador_id is not null) != (visitante_nome is not null)",
            name="colaborador_xor_visitante",
        ),
        Index("ix_almocos_colaborador_criado", "colaborador_id", "criado_em"),
        Index("ix_almocos_status_criado", "status", "criado_em"),
    )

    id: Mapped[uuid.UUID] = pk_uuid()
    colaborador_id: Mapped[uuid.UUID | None] = fk_uuid("colaboradores.id", obrigatorio=False)
    empresa_id: Mapped[uuid.UUID | None] = fk_uuid("empresas.id", obrigatorio=False)
    visitante_nome: Mapped[str | None] = mapped_column(String(160), nullable=True)
    # Departamento que recebe o visitante — só faz sentido junto de
    # visitante_nome, mas sem CHECK disso: departamento em si já é opcional.
    visitante_departamento_id: Mapped[uuid.UUID | None] = fk_uuid(
        "departamentos.id", obrigatorio=False
    )
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
    # Responsável/solicitante — frigobar de um setor, cortesia pra visita etc.
    # Não é quem paga: ajuste de estoque nunca gerou cobrança pra ninguém.
    colaborador_id: Mapped[uuid.UUID | None] = fk_uuid("colaboradores.id", obrigatorio=False)
    criado_em: Mapped[datetime] = criado_em()
