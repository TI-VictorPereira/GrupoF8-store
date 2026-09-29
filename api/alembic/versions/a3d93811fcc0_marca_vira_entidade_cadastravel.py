"""marca vira entidade cadastravel

`marca` era texto livre em cada produto — o mesmo nome digitado de jeitos
diferentes vira marcas "diferentes" sem ninguém perceber. Vira tabela própria,
igual `categorias_produto`, com o mesmo cadastro reaproveitável.

Sem dado a migrar: a tabela `produtos` está vazia neste momento (reset de
homologação), então a coluna de texto simplesmente vira coluna de referência.

Revision ID: a3d93811fcc0
Revises: a8ac5c81dac4
Create Date: 2026-09-29 13:21:47.322412
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'a3d93811fcc0'
down_revision: str | None = 'a8ac5c81dac4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "marcas",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("nome", sa.String(length=120), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_marcas")),
        sa.UniqueConstraint("nome", name=op.f("uq_marcas_nome")),
    )
    op.drop_column("produtos", "marca")
    op.add_column("produtos", sa.Column("marca_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_produtos_marca_id_marcas"), "produtos", "marcas", ["marca_id"], ["id"]
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_produtos_marca_id_marcas"), "produtos", type_="foreignkey")
    op.drop_column("produtos", "marca_id")
    op.add_column("produtos", sa.Column("marca", sa.String(length=120), nullable=True))
    op.drop_table("marcas")
