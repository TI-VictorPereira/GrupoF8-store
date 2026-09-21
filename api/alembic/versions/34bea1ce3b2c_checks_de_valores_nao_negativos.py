"""checks de valores nao negativos

Revision ID: 34bea1ce3b2c
Revises: 3cb9567c8476
Create Date: 2026-09-21 11:57:38.763900
"""

from collections.abc import Sequence

from alembic import op

revision: str = "34bea1ce3b2c"
down_revision: str | None = "3cb9567c8476"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# (tabela, nome da restrição, condição)
CHECKS: list[tuple[str, str, str]] = [
    ("empresas", "codemp_positivo", "codemp > 0"),
    ("colaboradores", "codparc_positivo", "codparc > 0"),
    ("colaboradores", "matricula_positiva", "matricula is null or matricula > 0"),
    ("produtos", "custo_nao_negativo", "custo >= 0"),
    ("produtos", "preco_nao_negativo", "preco_venda >= 0"),
    ("precos_almoco", "valor_nao_negativo", "valor >= 0"),
    (
        "precos_almoco",
        "vigencia_coerente",
        "vigencia_fim is null or vigencia_fim >= vigencia_inicio",
    ),
    ("pedidos", "valor_nao_negativo", "valor_total >= 0"),
    ("itens_pedido", "preco_nao_negativo", "preco_unitario >= 0"),
    ("itens_pedido", "custo_nao_negativo", "custo_unitario >= 0"),
    ("almocos", "valor_nao_negativo", "valor >= 0"),
]


def upgrade() -> None:
    for tabela, nome, condicao in CHECKS:
        op.create_check_constraint(nome, tabela, condicao)


def downgrade() -> None:
    for tabela, nome, _ in reversed(CHECKS):
        op.drop_constraint(nome, tabela, type_="check")
