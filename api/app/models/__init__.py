"""Importar TODOS os modelos aqui.

O Alembic só enxerga o que estiver registrado em `Base.metadata`. Um modelo
esquecido neste arquivo some silenciosamente das migrations.
"""

from app.models.acesso import SolicitacaoSenha, TentativaLogin
from app.models.auditoria import LogAcesso, LogAuditoria
from app.models.base import Base
from app.models.cadastro import (
    CategoriaProduto,
    Colaborador,
    Departamento,
    Empresa,
    PrecoAlmoco,
    Produto,
)
from app.models.exportacao import Exportacao
from app.models.operacao import AjusteEstoque, Almoco, ItemPedido, Pedido

__all__ = [
    "AjusteEstoque",
    "Almoco",
    "Base",
    "CategoriaProduto",
    "Colaborador",
    "Departamento",
    "Empresa",
    "Exportacao",
    "ItemPedido",
    "LogAcesso",
    "LogAuditoria",
    "Pedido",
    "PrecoAlmoco",
    "Produto",
    "SolicitacaoSenha",
    "TentativaLogin",
]
