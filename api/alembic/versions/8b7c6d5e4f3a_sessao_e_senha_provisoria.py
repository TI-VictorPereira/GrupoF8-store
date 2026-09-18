"""corte de sessao e validade da senha provisoria

Revision ID: 8b7c6d5e4f3a
Revises: 1261db446ea4
Create Date: 2026-09-17 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "8b7c6d5e4f3a"
down_revision: str | None = "1261db446ea4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "colaboradores",
        sa.Column("senha_provisoria_expira_em", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "colaboradores",
        sa.Column("tokens_validos_apos", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("colaboradores", "tokens_validos_apos")
    op.drop_column("colaboradores", "senha_provisoria_expira_em")
