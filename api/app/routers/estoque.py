"""Operações administrativas de estoque."""

import uuid

from fastapi import APIRouter

from app.core.deps import AdminLiberado, Sessao
from app.models.cadastro import Produto
from app.modules import estoque
from app.schemas.operacao import EntradaAjusteEstoque, ProdutoSaida

rotas = APIRouter(prefix="/estoque", tags=["estoque"])


@rotas.post("/{produto_id}/ajustes", response_model=ProdutoSaida)
def ajustar(
    produto_id: uuid.UUID, dados: EntradaAjusteEstoque, ator: AdminLiberado, sessao: Sessao
) -> Produto:
    return estoque.ajustar(sessao, ator, produto_id, dados.tipo, dados.quantidade, dados.motivo)
