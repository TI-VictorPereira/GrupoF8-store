"""Paginação de listagens: conta e corta no banco, nunca traz tudo pra memória."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.sql import Select


def contar(sessao: Session, consulta: Select) -> int:
    """Total de linhas da consulta, ignorando ORDER BY (não afeta a contagem)."""
    return sessao.scalar(select(func.count()).select_from(consulta.order_by(None).subquery())) or 0
