"""responsavel opcional no ajuste de estoque

Baixa de frigobar ou cortesia pra visita/cliente não desconta de ninguém —
`ajustes_estoque` nunca tocou em pedido nem em consumo, só em estoque. Este
campo é só pra registrar a pedido de quem foi, sem nenhum efeito de cobrança.

Revision ID: 150c9a8025db
Revises: a3d93811fcc0
Create Date: 2026-09-29 17:31:57.483017
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '150c9a8025db'
down_revision: str | None = 'a3d93811fcc0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("ajustes_estoque", sa.Column("colaborador_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_ajustes_estoque_colaborador_id_colaboradores"),
        "ajustes_estoque",
        "colaboradores",
        ["colaborador_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_ajustes_estoque_colaborador_id_colaboradores"),
        "ajustes_estoque",
        type_="foreignkey",
    )
    op.drop_column("ajustes_estoque", "colaborador_id")
