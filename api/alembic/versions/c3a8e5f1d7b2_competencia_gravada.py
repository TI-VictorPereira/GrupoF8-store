"""competencia gravada e dia de corte com vigencia

`cortes_ciclo`: o dia em que o ciclo fecha, com vigência. Começa com o dia 15,
valendo desde sempre. Trocar o dia passa a ser um registro novo, nunca uma
reinterpretação do passado.

`pedidos.competencia` / `almocos.competencia`: o ciclo de cada registro,
gravado na criação. Os registros existentes são preenchidos com a regra do
dia 15 no fuso de São Paulo, a mesma conta que o sistema fazia até aqui.

Revision ID: c3a8e5f1d7b2
Revises: b7e4c1a9d2f3
Create Date: 2026-10-15
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'c3a8e5f1d7b2'
down_revision: str | None = 'b7e4c1a9d2f3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COMPETENCIA_DIA_15 = (
    "to_char(date_trunc('month', (criado_em at time zone 'America/Sao_Paulo')"
    " - interval '15 days') + interval '1 month', 'YYYY-MM')"
)


def upgrade() -> None:
    op.create_table(
        "cortes_ciclo",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("dia", sa.Integer(), nullable=False),
        sa.Column("primeira_competencia", sa.String(length=7), nullable=False),
        sa.Column("vigente_desde", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("criado_por", sa.Uuid(), nullable=True),
        sa.CheckConstraint("dia between 1 and 27", name=op.f("ck_cortes_ciclo_dia_valido")),
        sa.ForeignKeyConstraint(
            ["criado_por"],
            ["colaboradores.id"],
            name=op.f("fk_cortes_ciclo_criado_por_colaboradores"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cortes_ciclo")),
    )
    op.create_index(
        op.f("ix_cortes_ciclo_vigente_desde"), "cortes_ciclo", ["vigente_desde"], unique=False
    )
    op.execute(
        "insert into cortes_ciclo (dia, primeira_competencia, vigente_desde)"
        " values (15, '2000-01', '2000-01-01 00:00:00-03')"
    )

    for tabela in ("pedidos", "almocos"):
        op.add_column(tabela, sa.Column("competencia", sa.String(length=7), nullable=True))
        op.execute(f"update {tabela} set competencia = {_COMPETENCIA_DIA_15}")
        op.alter_column(tabela, "competencia", nullable=False)
        op.create_index(op.f(f"ix_{tabela}_competencia"), tabela, ["competencia"], unique=False)


def downgrade() -> None:
    for tabela in ("almocos", "pedidos"):
        op.drop_index(op.f(f"ix_{tabela}_competencia"), table_name=tabela)
        op.drop_column(tabela, "competencia")
    op.drop_index(op.f("ix_cortes_ciclo_vigente_desde"), table_name="cortes_ciclo")
    op.drop_table("cortes_ciclo")
