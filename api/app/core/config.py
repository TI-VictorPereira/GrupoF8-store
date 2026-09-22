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

    @property
    def url_para_alembic(self) -> str:
        return self.database_url_direta or self.database_url


@lru_cache
def obter_config() -> Config:
    return Config()  # type: ignore[call-arg]
