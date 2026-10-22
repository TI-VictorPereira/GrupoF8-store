"""limite mensal da loja

`colaboradores.limite_mensal`: teto de compras na loja por ciclo. Nulo é sem
limite, então ninguém é afetado até o admin cadastrar um valor. Não vale para
o almoço.

Revision ID: d4f1a7c9e5b3
Revises: c3a8e5f1d7b2
Create Date: 2026-10-22
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'd4f1a7c9e5b3'
down_revision: str | None = 'c3a8e5f1d7b2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "colaboradores", sa.Column("limite_mensal", sa.Numeric(precision=10, scale=2), nullable=True)
    )
    op.create_check_constraint(
        op.f("ck_colaboradores_limite_nao_negativo"),
        "colaboradores",
        "limite_mensal is null or limite_mensal >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_colaboradores_limite_nao_negativo"), "colaboradores", type_="check"
    )
    op.drop_column("colaboradores", "limite_mensal")
