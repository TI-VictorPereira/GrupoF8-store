"""visitante no almoco

Visitante não tem cadastro de colaborador nem empresa — os dois viram
opcionais, e `visitante_nome` guarda quem é. A constraint nova impede a
inconsistência de um almoço não ser nem de colaborador nem de visitante (ou
os dois ao mesmo tempo).

O índice parcial `almocos_um_por_dia` não muda: no Postgres, NULL nunca é
igual a NULL num índice único, então múltiplos visitantes (ou o mesmo
visitante duas vezes) não esbarram na regra de "um almoço por colaborador por
dia" — essa regra é só do colaborador cadastrado mesmo.

Revision ID: c63d8b673fa4
Revises: 150c9a8025db
Create Date: 2026-09-29 18:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'c63d8b673fa4'
down_revision: str | None = '150c9a8025db'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("almocos", "colaborador_id", nullable=True)
    op.alter_column("almocos", "empresa_id", nullable=True)
    op.add_column("almocos", sa.Column("visitante_nome", sa.String(length=160), nullable=True))

    op.drop_constraint(op.f("ck_almocos_origem_valida"), "almocos", type_="check")
    op.create_check_constraint(
        op.f("ck_almocos_origem_valida"), "almocos", "origem in ('totem', 'manual', 'visitante')"
    )
    op.create_check_constraint(
        op.f("ck_almocos_colaborador_xor_visitante"),
        "almocos",
        "(colaborador_id is not null) != (visitante_nome is not null)",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_almocos_colaborador_xor_visitante"), "almocos", type_="check")
    op.drop_constraint(op.f("ck_almocos_origem_valida"), "almocos", type_="check")
    op.create_check_constraint(
        op.f("ck_almocos_origem_valida"), "almocos", "origem in ('totem', 'manual')"
    )
    op.drop_column("almocos", "visitante_nome")
    op.alter_column("almocos", "empresa_id", nullable=False)
    op.alter_column("almocos", "colaborador_id", nullable=False)
