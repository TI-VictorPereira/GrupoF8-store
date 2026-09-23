"""Rotas do catálogo: vitrine para o colaborador, manutenção para o admin."""

import uuid

from fastapi import APIRouter

from app.core.deps import AdminLiberado, ConsumidorLiberado, Sessao
from app.models.cadastro import CategoriaProduto, Produto
from app.modules import produtos
from app.modules.produtos import DadosProduto
from app.schemas.comum import EntradaAtivo
from app.schemas.produto import (
    CategoriaSaida,
    EntradaImportacaoProduto,
    EntradaProduto,
    ProdutoCompleto,
    ProdutoVitrine,
    ResultadoImportacaoProdutoSaida,
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
def vitrine(ator: ConsumidorLiberado, sessao: Sessao) -> list[Produto]:
    """O que o colaborador vê na loja. Sem custo: margem não é assunto dele."""
    return produtos.listar_vitrine(sessao)


@rotas.get("/categorias", response_model=list[CategoriaSaida])
def categorias(ator: ConsumidorLiberado, sessao: Sessao) -> list[CategoriaProduto]:
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


@rotas.post("/importar", response_model=ResultadoImportacaoProdutoSaida)
def importar(
    dados: EntradaImportacaoProduto, ator: AdminLiberado, sessao: Sessao
) -> ResultadoImportacaoProdutoSaida:
    """Cria ou atualiza pelo código. Estoque entra por ajuste, não por escrita."""
    resultado = produtos.importar(
        sessao,
        ator,
        [
            produtos.LinhaImportacao(
                codigo=linha.codigo,
                nome=linha.nome,
                categoria=linha.categoria,
                custo=linha.custo,
                preco_venda=linha.preco_venda,
                estoque=linha.estoque,
                ativo=linha.ativo,
            )
            for linha in dados.linhas
        ],
    )
    return ResultadoImportacaoProdutoSaida(
        criados=resultado.criados,
        atualizados=resultado.atualizados,
        erros=resultado.erros,
    )
