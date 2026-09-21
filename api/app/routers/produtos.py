"""Rotas do catálogo: vitrine para o colaborador, manutenção para o admin."""

import uuid

from fastapi import APIRouter

from app.core.deps import AdminLiberado, AtorLiberado, Sessao
from app.models.cadastro import CategoriaProduto, Produto
from app.modules import produtos
from app.modules.produtos import DadosProduto
from app.schemas.comum import EntradaAtivo
from app.schemas.produto import (
    CategoriaSaida,
    EntradaProduto,
    ProdutoCompleto,
    ProdutoVitrine,
)

rotas = APIRouter(prefix="/produtos", tags=["produtos"])


def _dados(entrada: EntradaProduto) -> DadosProduto:
    return DadosProduto(
        nome=entrada.nome,
        codigo=entrada.codigo,
        preco_venda=entrada.preco_venda,
        custo=entrada.custo,
        categoria_id=entrada.categoria_id,
        foto_url=entrada.foto_url,
    )


@rotas.get("/vitrine", response_model=list[ProdutoVitrine])
def vitrine(ator: AtorLiberado, sessao: Sessao) -> list[Produto]:
    """O que o colaborador vê na loja. Sem custo: margem não é assunto dele."""
    return produtos.listar_vitrine(sessao)


@rotas.get("/categorias", response_model=list[CategoriaSaida])
def categorias(ator: AtorLiberado, sessao: Sessao) -> list[CategoriaProduto]:
    return produtos.listar_categorias(sessao)


@rotas.get("", response_model=list[ProdutoCompleto])
def listar(ator: AdminLiberado, sessao: Sessao) -> list[Produto]:
    return produtos.listar(sessao, ator)


@rotas.post("", response_model=ProdutoCompleto, status_code=201)
def criar(dados: EntradaProduto, ator: AdminLiberado, sessao: Sessao) -> Produto:
    return produtos.criar(sessao, ator, _dados(dados))


@rotas.put("/{produto_id}", response_model=ProdutoCompleto)
def alterar(
    produto_id: uuid.UUID, dados: EntradaProduto, ator: AdminLiberado, sessao: Sessao
) -> Produto:
    return produtos.alterar(sessao, ator, produto_id, _dados(dados))


@rotas.patch("/{produto_id}/ativo", response_model=ProdutoCompleto)
def definir_ativo(
    produto_id: uuid.UUID, dados: EntradaAtivo, ator: AdminLiberado, sessao: Sessao
) -> Produto:
    return produtos.definir_ativo(sessao, ator, produto_id, dados.ativo)
