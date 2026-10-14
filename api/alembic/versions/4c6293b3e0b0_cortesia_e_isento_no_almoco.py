"""cortesia e isento no almoco

`colaboradores.isento_almoco`: funcionário cujo almoço a empresa paga, não
desconta na folha dele.

`almocos.cortesia`: visitante que a recepção liberou sem cobrar.
`almocos.isento`: cópia de `colaboradores.isento_almoco` no momento do
almoço — não muda retroativamente se o cadastro mudar depois.
`almocos.pix_txid` / `pix_confirmado_em`: Pix do almoço do visitante
(mesmo padrão já usado em `pedidos`).

Revision ID: 4c6293b3e0b0
Revises: de836b6bf162
Create Date: 2026-10-14
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '4c6293b3e0b0'
down_revision: str | None = 'de836b6bf162'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "colaboradores",
        sa.Column("isento_almoco", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "almocos", sa.Column("cortesia", sa.Boolean(), nullable=False, server_default="false")
    )
    op.add_column(
        "almocos", sa.Column("isento", sa.Boolean(), nullable=False, server_default="false")
    )
    op.add_column("almocos", sa.Column("pix_txid", sa.String(length=20), nullable=True))
    op.add_column(
        "almocos", sa.Column("pix_confirmado_em", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("almocos", "pix_confirmado_em")
    op.drop_column("almocos", "pix_txid")
    op.drop_column("almocos", "isento")
    op.drop_column("almocos", "cortesia")
    op.drop_column("colaboradores", "isento_almoco")
