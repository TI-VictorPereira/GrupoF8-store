"""Pedidos: estoque atômico, snapshots e operações administrativas."""

import secrets
import uuid
from collections import Counter
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.excecoes import (
    CarrinhoVazio,
    ColaboradorInativo,
    Conflito,
    EstoqueInsuficiente,
    PedidoNaoPendente,
    ProdutoIndisponivel,
    SemPermissao,
)
from app.models.cadastro import CategoriaProduto, Colaborador, Produto
from app.models.operacao import ItemPedido, Pedido
from app.modules import auditoria
from app.modules.auditoria import Ator


def _codigo_retirada() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def finalizar(sessao: Session, ator: Ator, itens: list[tuple[uuid.UUID, int]]) -> Pedido:
    """Cria um pedido e debita estoque sem a janela de corrida ler/escrever."""
    if not itens:
        raise CarrinhoVazio()

    quantidades = Counter()
    for produto_id, quantidade in itens:
        if quantidade <= 0:
            raise CarrinhoVazio()
        quantidades[produto_id] += quantidade

    colaborador = sessao.get(Colaborador, ator.id)
    if colaborador is None or not colaborador.ativo:
        raise ColaboradorInativo()

    snapshots: list[tuple[Produto, int, str | None]] = []
    total = Decimal("0")
    # Ordem estável diminui a chance de deadlock quando dois carrinhos têm os
    # mesmos produtos em ordem diferente.
    for produto_id, quantidade in sorted(quantidades.items(), key=lambda item: str(item[0])):
        produto = sessao.execute(
            update(Produto)
            .where(
                Produto.id == produto_id,
                Produto.ativo.is_(True),
                Produto.estoque >= quantidade,
            )
            .values(estoque=Produto.estoque - quantidade)
            .returning(Produto)
        ).scalar_one_or_none()
        if produto is None:
            existente = sessao.get(Produto, produto_id)
            if existente is None or not existente.ativo:
                raise ProdutoIndisponivel()
            raise EstoqueInsuficiente(detalhes={"produto_id": str(produto_id)})

        categoria = (
            sessao.get(CategoriaProduto, produto.categoria_id) if produto.categoria_id else None
        )
        snapshots.append((produto, quantidade, categoria.nome if categoria else None))
        total += produto.preco_venda * quantidade

    pedido: Pedido | None = None
    # O índice parcial é a garantia final caso dois sorteios coincidam. O
    # savepoint evita que uma colisão rara derrube as baixas já feitas nesta
    # transação, e permite apenas tentar outro código.
    for _ in range(10):
        candidato = Pedido(
            colaborador_id=ator.id,
            empresa_id=colaborador.empresa_id,
            vinculo=colaborador.vinculo,
            matricula=colaborador.matricula,
            valor_total=total,
            codigo_retirada=_codigo_retirada(),
        )
        try:
            with sessao.begin_nested():
                sessao.add(candidato)
                sessao.flush()
        except IntegrityError:
            continue
        pedido = candidato
        break
    if pedido is None:
        # Dez colisões seguidas em 1 milhão de códigos é praticamente
        # impossível; ainda assim, isso é conflito de estado e não defeito —
        # o usuário recebe 409 com mensagem útil, não um 500 mudo.
        raise Conflito("Não foi possível gerar um código de retirada. Tente novamente.")

    for produto, quantidade, categoria in snapshots:
        sessao.add(
            ItemPedido(
                pedido_id=pedido.id,
                produto_id=produto.id,
                nome_produto=produto.nome,
                categoria=categoria,
                quantidade=quantidade,
                preco_unitario=produto.preco_venda,
                custo_unitario=produto.custo,
            )
        )
    sessao.flush()
    return pedido


def listar_proprios(sessao: Session, ator: Ator) -> list[Pedido]:
    return list(
        sessao.scalars(
            select(Pedido).where(Pedido.colaborador_id == ator.id).order_by(Pedido.criado_em.desc())
        )
    )


def listar_pendentes(sessao: Session, ator: Ator) -> list[Pedido]:
    # O router já protege a rota, mas o serviço não pode depender de quem o
    # chama: é aqui que mora a autorização desde que a RLS deixou de existir.
    if not ator.eh_admin:
        raise SemPermissao()
    consulta = select(Pedido).where(Pedido.status == "pendente").order_by(Pedido.criado_em)
    return list(sessao.scalars(consulta))


def entregar(sessao: Session, ator: Ator, pedido_id: uuid.UUID) -> Pedido:
    if not ator.eh_admin:
        raise SemPermissao()
    pedido = sessao.get(Pedido, pedido_id)
    if pedido is None or pedido.status != "pendente":
        raise PedidoNaoPendente()

    pedido.status = "entregue"
    pedido.entregue_em = datetime.now(UTC)
    pedido.entregue_por = ator.id
    auditoria.registrar(
        sessao,
        ator,
        acao="pedido.entregue",
        entidade="pedido",
        entidade_id=pedido.id,
        descricao=f"Confirmou a entrega do pedido {pedido.codigo_retirada}.",
        dados_anteriores={"status": "pendente"},
        dados_novos={"status": "entregue"},
    )
    return pedido


def cancelar(sessao: Session, ator: Ator, pedido_id: uuid.UUID, motivo: str) -> Pedido:
    if not ator.eh_admin:
        raise SemPermissao()
    pedido = sessao.get(Pedido, pedido_id)
    if pedido is None or pedido.status != "pendente":
        raise PedidoNaoPendente()

    itens = list(sessao.scalars(select(ItemPedido).where(ItemPedido.pedido_id == pedido.id)))
    itens_com_produto = (item for item in itens if item.produto_id)
    for item in sorted(itens_com_produto, key=lambda item: str(item.produto_id)):
        sessao.execute(
            update(Produto)
            .where(Produto.id == item.produto_id)
            .values(estoque=Produto.estoque + item.quantidade)
        )

    pedido.status = "cancelado"
    pedido.cancelado_em = datetime.now(UTC)
    pedido.motivo_cancelamento = motivo
    auditoria.registrar(
        sessao,
        ator,
        acao="pedido.cancelado",
        entidade="pedido",
        entidade_id=pedido.id,
        descricao=f"Cancelou o pedido {pedido.codigo_retirada}: {motivo}",
        dados_anteriores={"status": "pendente", "valor_total": str(pedido.valor_total)},
        dados_novos={"status": "cancelado", "motivo": motivo},
    )
    return pedido
