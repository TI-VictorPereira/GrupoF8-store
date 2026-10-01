"""pix na venda de loja a visitante

Visitante não tem cadastro de colaborador nem empresa — os três (colaborador,
empresa, vinculo) viram opcionais, e `visitante_nome` guarda quem é. Mesmo
padrão já usado no Almoco pro visitante do almoço.

`pix_txid` e `pix_confirmado_em` só são preenchidos quando a venda foi a
visitante e teve algo a pagar (venda 100% cortesia não gera Pix, e compra de
colaborador é paga em folha, não por Pix).

Revision ID: de836b6bf162
Revises: bb5a9ec140d1
Create Date: 2026-09-30 20:19:48.282560
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'de836b6bf162'
down_revision: str | None = 'bb5a9ec140d1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("pedidos", "colaborador_id", nullable=True)
    op.alter_column("pedidos", "empresa_id", nullable=True)
    op.alter_column("pedidos", "vinculo", nullable=True)
    op.add_column("pedidos", sa.Column("visitante_nome", sa.String(length=160), nullable=True))
    op.add_column("pedidos", sa.Column("pix_txid", sa.String(length=20), nullable=True))
    op.add_column(
        "pedidos", sa.Column("pix_confirmado_em", sa.DateTime(timezone=True), nullable=True)
    )

    op.drop_constraint(op.f("ck_pedidos_status_valido"), "pedidos", type_="check")
    op.create_check_constraint(
        op.f("ck_pedidos_status_valido"),
        "pedidos",
        "status in ('pendente', 'entregue', 'cancelado', 'aguardando_pagamento')",
    )
    op.create_check_constraint(
        op.f("ck_pedidos_colaborador_xor_visitante"),
        "pedidos",
        "(colaborador_id is not null) != (visitante_nome is not null)",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_pedidos_colaborador_xor_visitante"), "pedidos", type_="check")
    op.drop_constraint(op.f("ck_pedidos_status_valido"), "pedidos", type_="check")
    op.create_check_constraint(
        op.f("ck_pedidos_status_valido"),
        "pedidos",
        "status in ('pendente', 'entregue', 'cancelado')",
    )
    op.drop_column("pedidos", "pix_confirmado_em")
    op.drop_column("pedidos", "pix_txid")
    op.drop_column("pedidos", "visitante_nome")
    op.alter_column("pedidos", "vinculo", nullable=False)
    op.alter_column("pedidos", "empresa_id", nullable=False)
    op.alter_column("pedidos", "colaborador_id", nullable=False)
