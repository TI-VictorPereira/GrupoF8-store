"""Ajustes manuais de estoque, restritos ao administrador."""

import uuid

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.excecoes import (
    DadosInvalidos,
    EstoqueInsuficiente,
    NaoEncontrado,
    ProdutoIndisponivel,
    SemPermissao,
)
from app.models.cadastro import Produto
from app.models.operacao import AjusteEstoque
from app.modules import auditoria
from app.modules.auditoria import Ator


def ajustar(
    sessao: Session, ator: Ator, produto_id: uuid.UUID, tipo: str, quantidade: int, motivo: str
) -> Produto:
    if not ator.eh_admin:
        raise SemPermissao()
    # Entrada inválida não é "produto indisponível" — devolver o código errado
    # faz o front tratar como falta de estoque e esconde o defeito real.
    if tipo not in {"entrada", "baixa"}:
        raise DadosInvalidos("Tipo de ajuste inválido.", detalhes={"tipo": tipo})
    if quantidade <= 0:
        raise DadosInvalidos(
            "A quantidade do ajuste precisa ser positiva.", detalhes={"quantidade": quantidade}
        )

    valores = {"estoque": Produto.estoque + quantidade}
    condicoes = [Produto.id == produto_id]
    if tipo == "baixa":
        valores = {"estoque": Produto.estoque - quantidade}
        condicoes.append(Produto.estoque >= quantidade)

    produto = sessao.execute(
        update(Produto).where(*condicoes).values(**valores).returning(Produto)
    ).scalar_one_or_none()
    if produto is None:
        existente = sessao.get(Produto, produto_id)
        if existente is None:
            raise NaoEncontrado("Produto não encontrado.")
        raise EstoqueInsuficiente(detalhes={"produto_id": str(produto_id)})

    anterior = produto.estoque - quantidade if tipo == "entrada" else produto.estoque + quantidade
    sessao.add(
        AjusteEstoque(
            produto_id=produto.id,
            tipo=tipo,
            quantidade=quantidade,
            motivo=motivo,
            criado_por=ator.id,
        )
    )
    auditoria.registrar(
        sessao,
        ator,
        acao="estoque.ajustado",
        entidade="produto",
        entidade_id=produto.id,
        descricao=f"Ajustou o estoque de {produto.nome}: {tipo} de {quantidade} unidade(s).",
        dados_anteriores={"estoque": anterior},
        dados_novos={"estoque": produto.estoque, "tipo": tipo, "motivo": motivo},
    )
    return produto
