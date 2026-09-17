from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import obter_config
from app.models import Base  # importa todos os modelos

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Endpoint DIRETO do Neon, sem pooler: migration não pode passar por PgBouncer
# em modo transação.
config.set_main_option("sqlalchemy.url", obter_config().url_para_alembic)

target_metadata = Base.metadata

# Índices únicos parciais sobre expressão, criados à mão nas migrations. Não
# existem nos modelos, então o autogenerate os enxerga como "sobrando" e gera um
# drop_index a cada revisão nova. Aplicar isso sem reparar mata regra de negócio
# em silêncio: o sistema continua funcionando e só falha com dois usuários
# simultâneos. Ignorar aqui é o que impede o acidente.
INDICES_MANUAIS = {
    "almocos_um_por_dia",
    "pedidos_codigo_retirada_pendente_uk",
    "exportacoes_competencia_ativa_uk",
}


def incluir_objeto(objeto, nome, tipo, reflexo, comparador):
    if tipo == "index" and nome in INDICES_MANUAIS:
        return False
    return True


def executar_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        include_object=incluir_objeto,
        compare_type=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def executar_online() -> None:
    conectavel = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with conectavel.connect() as conexao:
        context.configure(
            connection=conexao,
            target_metadata=target_metadata,
            compare_type=True,
            include_object=incluir_objeto,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    executar_offline()
else:
    executar_online()
