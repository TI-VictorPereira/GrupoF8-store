"""Engine e sessão.

Serviço nunca dá commit. O commit acontece uma única vez, em `sessao()`, quando
a requisição termina sem erro — é o que garante que a mudança e o registro de
auditoria caiam juntos ou não caiam. Um `session.commit()` dentro de um serviço
quebra essa garantia sem dar erro nenhum.
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import obter_config

_config = obter_config()

# prepare_threshold=None desliga prepared statements do psycopg.
# O pooler do Neon roda PgBouncer em modo transação, onde prepared statements
# quebram com "prepared statement ... already exists" — e só em produção, sob
# concorrência. É o equivalente ao `?pgbouncer=true` que o Prisma exige.
engine = create_engine(
    _config.database_url,
    pool_pre_ping=True,  # o Neon derruba conexão depois do autosuspend
    pool_size=5,
    max_overflow=5,
    connect_args={"prepare_threshold": None},
    echo=False,
)

FabricaDeSessao = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def sessao() -> Generator[Session, None, None]:
    """Dependência do FastAPI. Uma sessão e uma transação por requisição."""
    sessao_atual = FabricaDeSessao()
    try:
        yield sessao_atual
        sessao_atual.commit()
    except Exception:
        sessao_atual.rollback()
        raise
    finally:
        sessao_atual.close()
