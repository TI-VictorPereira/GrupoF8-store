"""dados iniciais das empresas

As empresas do grupo, com o CODEMP do Sankhya. Isto é migration e não script
de seed porque não são dados de exemplo: são configuração do domínio que
produção também precisa — sem empresa não há como cadastrar colaborador, e o
CODEMP é o que decide em qual empresa a despesa é lançada.

Dado de exemplo (usuários com senha, produtos fictícios) continua no script
`app/scripts/semear.py`, que se recusa a rodar em produção. Migration entra em
todo ambiente; senha conhecida no repositório não pode entrar em nenhum.

Revision ID: 3cb9567c8476
Revises: 94084aae2586
Create Date: 2026-09-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "3cb9567c8476"
down_revision: str | None = "94084aae2586"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


EMPRESAS = [
    (1, "SAO BENTO LIGHTING SOLUTIONS"),
    (2, "N-LED COMERCIO E SERVICOS LTDA"),
    (3, "LEDLUZ INDUSTRIA E COMERCIO LTDA"),
    (4, "LUZ LED INDUSTRIA E COMERCIO LTDA"),
    (5, "F-LED INDUSTRIA E COMERCIO LTDA"),
    (7, "FAE INDUSTRIA E COMERCIO LTDA"),
    (8, "F-LED LIGHTING SOLUTIONS LTDA"),
    (10, "SPE AVIATION LTDA"),
    (14, "F-CITIES SOFTWARE E TECNOLOGIA LTDA"),
    (17, "SPE BRILHA GOIANIA CONCESSIONARIA DE CID"),
    (23, "SPE BRILHA VILA VELHA LTDA"),
]


def upgrade() -> None:
  
    op.execute(
        sa.text(
            """
            insert into empresas (codemp, nome)
            values """
            + ", ".join(f"(:c{i}, :n{i})" for i in range(len(EMPRESAS)))
            + """
            on conflict (codemp) do update set nome = excluded.nome
            """
        ).bindparams(
            *[
                p
                for i, (codemp, nome) in enumerate(EMPRESAS)
                for p in (sa.bindparam(f"c{i}", codemp), sa.bindparam(f"n{i}", nome))
            ]
        )
    )


def downgrade() -> None:
    
    op.execute(
        sa.text("delete from empresas where codemp in :codigos").bindparams(
            sa.bindparam("codigos", tuple(c for c, _ in EMPRESAS), expanding=True)
        )
    )
