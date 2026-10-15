"""papel entregador

`colaboradores.papel` ganha `entregador`: colaborador que também atende o
balcão (entrega e cancela pedido, vende a visitante, confirma almoço e Pix).

O downgrade falha de propósito enquanto houver alguém com papel `entregador`.

Revision ID: b7e4c1a9d2f3
Revises: 4c6293b3e0b0
Create Date: 2026-10-15
"""

from collections.abc import Sequence

from alembic import op

revision: str = 'b7e4c1a9d2f3'
down_revision: str | None = '4c6293b3e0b0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(op.f("ck_colaboradores_papel_valido"), "colaboradores", type_="check")
    op.create_check_constraint(
        op.f("ck_colaboradores_papel_valido"),
        "colaboradores",
        "papel in ('colaborador', 'refeitorio', 'dp', 'admin', 'entregador')",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_colaboradores_papel_valido"), "colaboradores", type_="check")
    op.create_check_constraint(
        op.f("ck_colaboradores_papel_valido"),
        "colaboradores",
        "papel in ('colaborador', 'refeitorio', 'dp', 'admin')",
    )
