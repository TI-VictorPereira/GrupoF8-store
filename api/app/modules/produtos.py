"""Catálogo de produtos: vitrine da loja e manutenção pelo administrador.

A movimentação de estoque não mora aqui — ela é sempre consequência de um
pedido ou de um ajuste auditado, em `pedidos.py` e `estoque.py`. Alterar um
produto nunca mexe na quantidade.
"""

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.excecoes import CodigoDuplicado, DadosInvalidos, NaoEncontrado, SemPermissao
from app.models.cadastro import CategoriaProduto, Produto
from app.modules import auditoria
from app.modules.auditoria import Ator


@dataclass
class DadosProduto:
    nome: str
    codigo: str
    preco_venda: Decimal
    custo: Decimal
    categoria_id: uuid.UUID | None = None
    foto_url: str | None = None


def _exigir_admin(ator: Ator) -> None:
    if not ator.eh_admin:
        raise SemPermissao()


def _validar(sessao: Session, dados: DadosProduto) -> None:
    if not dados.nome.strip():
        raise DadosInvalidos("O nome do produto é obrigatório.")
    if dados.preco_venda < 0 or dados.custo < 0:
        raise DadosInvalidos("Preço e custo não podem ser negativos.")
    if dados.categoria_id and sessao.get(CategoriaProduto, dados.categoria_id) is None:
        raise NaoEncontrado("Categoria não encontrada.")
    # A foto vive no object storage; a coluna guarda só a URL. Base64 aqui
    # significaria arrastar a imagem inteira em toda listagem da loja.
    if dados.foto_url and len(dados.foto_url) > 500:
        raise DadosInvalidos("A foto deve ser enviada ao storage; aqui vai apenas a URL.")


def _retrato(produto: Produto) -> dict[str, Any]:
    # Dinheiro sempre com duas casas. Sem isso, o valor lido do objeto em
    # memória sai "5" e o lido do banco sai "5.00" — na trilha de auditoria
    # isso parece uma alteração de preço que nunca aconteceu.
    return {
        "nome": produto.nome,
        "codigo": produto.codigo,
        "categoria_id": str(produto.categoria_id) if produto.categoria_id else None,
        "custo": f"{produto.custo:.2f}",
        "preco_venda": f"{produto.preco_venda:.2f}",
        "foto_url": produto.foto_url,
        "ativo": produto.ativo,
    }


def listar_categorias(sessao: Session) -> list[CategoriaProduto]:
    return list(sessao.scalars(select(CategoriaProduto).order_by(CategoriaProduto.nome)))


def listar_vitrine(sessao: Session) -> list[Produto]:
    """O que o colaborador vê na loja: só o que está ativo."""
    return list(
        sessao.scalars(select(Produto).where(Produto.ativo.is_(True)).order_by(Produto.nome))
    )


def listar(sessao: Session, ator: Ator) -> list[Produto]:
    """Visão do administrador: inclui os inativos."""
    _exigir_admin(ator)
    return list(sessao.scalars(select(Produto).order_by(Produto.nome)))


def criar(sessao: Session, ator: Ator, dados: DadosProduto) -> Produto:
    _exigir_admin(ator)
    _validar(sessao, dados)

    produto = Produto(
        nome=dados.nome.strip(),
        codigo=dados.codigo.strip(),
        categoria_id=dados.categoria_id,
        custo=dados.custo,
        preco_venda=dados.preco_venda,
        foto_url=dados.foto_url,
        estoque=0,  # entra por ajuste auditado, nunca direto no cadastro
        ativo=True,
    )
    try:
        with sessao.begin_nested():
            sessao.add(produto)
            sessao.flush()
    except IntegrityError:
        raise CodigoDuplicado("Já existe um produto com este código.") from None

    auditoria.registrar(
        sessao,
        ator,
        acao="produto.criado",
        entidade="produto",
        entidade_id=produto.id,
        descricao=f"Cadastrou o produto {produto.nome}.",
        dados_novos=_retrato(produto),
    )
    return produto


def alterar(sessao: Session, ator: Ator, produto_id: uuid.UUID, dados: DadosProduto) -> Produto:
    _exigir_admin(ator)
    _validar(sessao, dados)

    produto = sessao.get(Produto, produto_id)
    if produto is None:
        raise NaoEncontrado("Produto não encontrado.")

    antes = _retrato(produto)
    produto.nome = dados.nome.strip()
    produto.codigo = dados.codigo.strip()
    produto.categoria_id = dados.categoria_id
    produto.custo = dados.custo
    produto.preco_venda = dados.preco_venda
    produto.foto_url = dados.foto_url

    try:
        sessao.flush()
    except IntegrityError:
        raise CodigoDuplicado("Já existe um produto com este código.") from None

    depois = _retrato(produto)
    mudou = {c for c in antes if antes[c] != depois[c]}
    if mudou:
        auditoria.registrar(
            sessao,
            ator,
            acao="produto.alterado",
            entidade="produto",
            entidade_id=produto.id,
            descricao=f"Alterou o produto {produto.nome}.",
            dados_anteriores={c: antes[c] for c in mudou},
            dados_novos={c: depois[c] for c in mudou},
        )
    return produto


def definir_ativo(sessao: Session, ator: Ator, produto_id: uuid.UUID, ativo: bool) -> Produto:
    _exigir_admin(ator)
    produto = sessao.get(Produto, produto_id)
    if produto is None:
        raise NaoEncontrado("Produto não encontrado.")
    if produto.ativo == ativo:
        return produto

    produto.ativo = ativo
    auditoria.registrar(
        sessao,
        ator,
        acao="produto.reativado" if ativo else "produto.inativado",
        entidade="produto",
        entidade_id=produto.id,
        descricao=f"{'Reativou' if ativo else 'Inativou'} o produto {produto.nome}.",
        dados_anteriores={"ativo": not ativo},
        dados_novos={"ativo": ativo},
    )
    return produto
