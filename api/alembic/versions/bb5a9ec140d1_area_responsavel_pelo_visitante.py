"""area responsavel pelo visitante

Revision ID: bb5a9ec140d1
Revises: c63d8b673fa4
Create Date: 2026-09-29 19:40:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'bb5a9ec140d1'
down_revision: str | None = 'c63d8b673fa4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "almocos", sa.Column("visitante_departamento_id", sa.Uuid(), nullable=True)
    )
    op.create_foreign_key(
        op.f("fk_almocos_visitante_departamento_id_departamentos"),
        "almocos",
        "departamentos",
        ["visitante_departamento_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_almocos_visitante_departamento_id_departamentos"), "almocos", type_="foreignkey"
    )
    op.drop_column("almocos", "visitante_departamento_id")
