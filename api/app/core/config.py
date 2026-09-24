"""Configuração da aplicação, lida do ambiente.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ambiente: Literal["desenvolvimento", "producao"] = "desenvolvimento"

    # --- banco ---------------------------------------------------------------
    database_url: str
    database_url_direta: str = ""

    # --- sessão --------------------------------------------------------------
    jwt_secret: str
    jwt_algoritmo: str = "HS256"
    acesso_expira_minutos: int = 30
    refresh_expira_horas: int = 12

    cookie_dominio: str = ""
    cookie_seguro: bool = True

    # --- política de login ---------------------------------------------------
    max_tentativas: int = 5
    bloqueio_minutos: int = 2
    senha_tamanho_minimo: int = 8
    senha_provisoria_validade_horas: int = 48
    senha_hash_rapido: bool = False

    # --- banco: pool ------------------------------------------------------
    # Padrão pensado para container de vida longa (VPS): um pool pequeno e
    # fixo por processo. Em serverless (Vercel) cada instância quente pode
    # segurar até `pool_size + max_overflow` conexões, e o número de
    # instâncias é elástico — o valor certo ali é 1/0, deixando o pooler do
    # Neon (PgBouncer, modo transação) absorver a concorrência de verdade.
    # Errar isso não aparece em teste: estoura o limite de conexões do
    # pooler na hora do almoço, com o sistema já em produção.
    db_pool_size: int = 5
    db_max_overflow: int = 5

    # --- almoço --------------------------------------------------------------
    # 12 horas: o código é gerado no celular, no notebook ou no desktop, e nem
    # sempre quem gera está a caminho do refeitório. Quem garante um almoço por
    # pessoa por dia é o índice `almocos_um_por_dia`, não este prazo — aqui o
    # prazo serve para o painel não ficar contando como "aguardando" alguém que
    # gerou de manhã e não apareceu.
    almoco_validade_minutos: int = 720
    pedido_validade_horas: int = 8
    fuso: str = "America/Sao_Paulo"

    # --- observabilidade -----------------------------------------------------
    sentry_dsn: str = ""
    log_nivel: str = Field(default="INFO")

    # --- relógio sem processo de fundo ----------------------------------
    # Vazio desliga a rota. Só existe em deploy serverless (Vercel), onde não
    # há como manter um laço contínuo: um agendador externo bate aqui com
    # este segredo no lugar do serviço `relogio` do compose de produção.
    cron_secret: str = ""

    @property
    def url_para_alembic(self) -> str:
        return self.database_url_direta or self.database_url


@lru_cache
def obter_config() -> Config:
    return Config()  # type: ignore[call-arg]
