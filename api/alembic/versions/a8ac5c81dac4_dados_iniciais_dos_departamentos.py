"""dados iniciais dos departamentos

O organograma real da empresa. É migration e não script de seed pelo mesmo
motivo das empresas (ver `3cb9567c8476`): não é dado de exemplo, é
configuração do domínio que também é necessária fora do dev — sem
departamento cadastrado, o colaborador real não tem o que selecionar no
cadastro.

Revision ID: a8ac5c81dac4
Revises: 34bea1ce3b2c
Create Date: 2026-09-29 12:40:13.672320
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'a8ac5c81dac4'
down_revision: str | None = '34bea1ce3b2c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


DEPARTAMENTOS = [
    "ACABAMENTO DE LUMINÁRIAS",
    "ADMINISTRATIVO NV",
    "ALMOXARIFADO",
    "ARQUITETURA",
    "CIDADES INTELIGENTES",
    "COMPRAS",
    "CONTABILIDADE",
    "CONTRATOS E ADESÕES",
    "CONTROLADORIA",
    "CONTROLE INTERNO",
    "COTAÇÃO",
    "COTAÇÃO- NV",
    "DEPARTAMENTO PESSOAL",
    "DIRETORIA",
    "DISTRIBUIÇÃO",
    "ENGENHARIA",
    "EXPEDIÇÃO",
    "FACILITES",
    "FATURAMENTO",
    "FINANCEIRO F8",
    "FINANCEIRO NV",
    "GESTÃO DE FROTA",
    "GIE- GESTÃO INTEGRADA DE ESTOQUE",
    "IMPORTAÇÃO",
    "LABORATÓRIO DE LUMINÁRIAS",
    "LICITAÇÃO",
    "MANUTENÇÃO",
    "PINTURA",
    "PRESIDENCIA",
    "RECURSOS HUMANOS",
    "SERRALHERIA",
    "TECNOLOGIA DA INFORMAÇÃO",
    "TRANSPORTES",
    "VENDAS",
    "Administrativo",
    "Logística",
    "Produção",
]


def upgrade() -> None:
    op.execute(
        sa.text(
            "insert into departamentos (nome) values "
            + ", ".join(f"(:n{i})" for i in range(len(DEPARTAMENTOS)))
            + " on conflict (nome) do nothing"
        ).bindparams(
            *[sa.bindparam(f"n{i}", nome) for i, nome in enumerate(DEPARTAMENTOS)]
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text("delete from departamentos where nome in :nomes").bindparams(
            sa.bindparam("nomes", tuple(DEPARTAMENTOS), expanding=True)
        )
    )
