"""Configuração da aplicação, lida do ambiente.

Nenhum valor sensível tem default. Se faltar variável, a aplicação não sobe —
falhar no boot é melhor que rodar meio configurada.
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
    # Endpoint COM pooler do Neon. Ver observação em core/db.py.
    database_url: str
    # Endpoint DIRETO (sem pooler). Usado só pelo Alembic — migration não pode
    # passar por PgBouncer em modo transação.
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

    # --- almoço --------------------------------------------------------------
    almoco_validade_minutos: int = 15
    fuso: str = "America/Sao_Paulo"

    # --- observabilidade -----------------------------------------------------
    sentry_dsn: str = ""
    log_nivel: str = Field(default="INFO")

    @property
    def url_para_alembic(self) -> str:
        return self.database_url_direta or self.database_url


@lru_cache
def obter_config() -> Config:
    return Config()  # type: ignore[call-arg]
