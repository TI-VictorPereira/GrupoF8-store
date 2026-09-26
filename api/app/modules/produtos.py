"""Catálogo de produtos: vitrine da loja e manutenção pelo administrador.
"""

import uuid
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.excecoes import (
    CategoriaDuplicada,
    CategoriaNaoEncontrada,
    CodigoDuplicado,
    FotoUrlLonga,
    ImportacaoGrandeDemais,
    ImportacaoVazia,
    NomeObrigatorio,
    ProdutoIncompletoNaImportacao,
    ProdutoNaoEncontrado,
    SemPermissao,
    ValorNegativo,
)
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
        raise NomeObrigatorio(detalhes={"entidade": "produto"})
    if dados.preco_venda < 0 or dados.custo < 0:
        raise ValorNegativo()
    if dados.categoria_id and sessao.get(CategoriaProduto, dados.categoria_id) is None:
        raise CategoriaNaoEncontrada()
    # A foto vive no object storage; a coluna guarda só a URL. Base64 aqui
    # significaria arrastar a imagem inteira em toda listagem da loja.
    if dados.foto_url and len(dados.foto_url) > 500:
        raise FotoUrlLonga()


def _retrato(produto: Produto) -> dict[str, Any]:

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


def criar_categoria(sessao: Session, ator: Ator, nome: str) -> CategoriaProduto:
    _exigir_admin(ator)
    if not nome.strip():
        raise NomeObrigatorio(detalhes={"entidade": "categoria"})

    categoria = CategoriaProduto(nome=nome.strip())
    try:
        with sessao.begin_nested():
            sessao.add(categoria)
            sessao.flush()
    except IntegrityError:
        raise CategoriaDuplicada() from None

    auditoria.registrar(
        sessao,
        ator,
        acao="categoria.criada",
        entidade="categoria_produto",
        entidade_id=categoria.id,
        descricao=f"Cadastrou a categoria {categoria.nome}.",
        dados_novos={"nome": categoria.nome},
    )
    return categoria


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
        raise ProdutoNaoEncontrado()

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
        raise ProdutoNaoEncontrado()
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


@dataclass
class LinhaImportacao:
    """Uma linha da planilha. Tudo opcional menos o código, que é a chave.

    Campo ausente significa "não mexer": a planilha pode trazer só código e
    preço para um reajuste, sem zerar o resto do cadastro.
    """

    codigo: str
    nome: str | None = None
    categoria: str | None = None
    custo: Decimal | None = None
    preco_venda: Decimal | None = None
    estoque: int | None = None
    ativo: bool | None = None


@dataclass
class ResultadoImportacaoProdutos:
    criados: int = 0
    atualizados: int = 0
    erros: list[str] = field(default_factory=list)


def _categoria_por_nome(sessao: Session, nome: str) -> uuid.UUID | None:
    alvo = nome.strip().lower()
    for categoria in sessao.scalars(select(CategoriaProduto)):
        if categoria.nome.strip().lower() == alvo:
            return categoria.id
    raise CategoriaNaoEncontrada(f"Categoria '{nome}' não existe.")


def _aplicar_estoque(sessao: Session, ator: Ator, produto: Produto, desejado: int) -> None:
    """Leva o estoque ao número da planilha por ajuste, não por atribuição.

    O cadastro nunca escreve quantidade direto — é a regra deste módulo desde
    o começo. Importar seria a porta dos fundos para furar isso: o número
    mudaria sem motivo registrado e ninguém saberia de onde veio. Aqui a
    diferença vira entrada ou baixa, com motivo.
    """
    from app.modules import estoque

    diferenca = desejado - produto.estoque
    if diferenca == 0:
        return
    estoque.ajustar(
        sessao,
        ator,
        produto.id,
        "entrada" if diferenca > 0 else "baixa",
        abs(diferenca),
        "Importação de planilha",
    )


def importar(
    sessao: Session, ator: Ator, linhas: list[LinhaImportacao]
) -> ResultadoImportacaoProdutos:
    """Cria ou atualiza produtos pelo código, pulando as linhas com problema.

    Cada linha entra num savepoint: uma falha não derruba as anteriores. O
    commit continua na borda da requisição — ou o lote inteiro entra, ou nada
    entra, se algo estourar depois.
    """
    _exigir_admin(ator)
    if not linhas:
        raise ImportacaoVazia()
    if len(linhas) > 500:
        raise ImportacaoGrandeDemais()

    resultado = ResultadoImportacaoProdutos()

    for indice, linha in enumerate(linhas, start=1):
        try:
            with sessao.begin_nested():
                existente = sessao.scalar(
                    select(Produto).where(Produto.codigo == linha.codigo.strip())
                )
                categoria_id = (
                    _categoria_por_nome(sessao, linha.categoria) if linha.categoria else None
                )

                if existente is None:
                    if not linha.nome or linha.preco_venda is None:
                        raise ProdutoIncompletoNaImportacao()
                    produto = criar(
                        sessao,
                        ator,
                        DadosProduto(
                            nome=linha.nome,
                            codigo=linha.codigo,
                            preco_venda=linha.preco_venda,
                            custo=linha.custo or Decimal("0"),
                            categoria_id=categoria_id,
                        ),
                    )
                    resultado.criados += 1
                else:
                    produto = alterar(
                        sessao,
                        ator,
                        existente.id,
                        DadosProduto(
                            nome=linha.nome or existente.nome,
                            codigo=existente.codigo,
                            preco_venda=(
                                linha.preco_venda
                                if linha.preco_venda is not None
                                else existente.preco_venda
                            ),
                            custo=linha.custo if linha.custo is not None else existente.custo,
                            categoria_id=(
                                categoria_id if linha.categoria else existente.categoria_id
                            ),
                            foto_url=existente.foto_url,
                        ),
                    )
                    resultado.atualizados += 1

                if linha.ativo is not None and produto.ativo != linha.ativo:
                    definir_ativo(sessao, ator, produto.id, linha.ativo)
                if linha.estoque is not None:
                    _aplicar_estoque(sessao, ator, produto, linha.estoque)

        except Exception as erro:  # noqa: BLE001 — a linha ruim não pode parar o lote
            mensagem = getattr(erro, "mensagem", None) or type(erro).__name__
            resultado.erros.append(f"linha {indice} ({linha.codigo}): {mensagem}")

    auditoria.registrar(
        sessao,
        ator,
        acao="produtos.importados",
        entidade="produto",
        descricao=(
            f"Importou planilha: {resultado.criados} criado(s), "
            f"{resultado.atualizados} atualizado(s), {len(resultado.erros)} com erro."
        ),
        dados_novos={
            "criados": resultado.criados,
            "atualizados": resultado.atualizados,
            "erros": resultado.erros,
        },
    )
    return resultado
