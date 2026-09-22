"""Pedidos: estoque atômico, snapshots e operações administrativas."""

import secrets
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import obter_config
from app.excecoes import (
    CarrinhoVazio,
    CodigoRetiradaIndisponivel,
    ColaboradorInativo,
    EstoqueInsuficiente,
    PedidoNaoPendente,
    PeriodoInvalido,
    ProdutoIndisponivel,
    SemPermissao,
)
from app.models.cadastro import CategoriaProduto, Colaborador, Departamento, Produto
from app.models.operacao import ItemPedido, Pedido
from app.modules import auditoria
from app.modules.auditoria import ATOR_RELOGIO, Ator

_config = obter_config()


def _agora() -> datetime:
    return datetime.now(UTC)


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
        raise CodigoRetiradaIndisponivel()

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


def entregar(sessao: Session, ator: Ator, pedido_id: uuid.UUID) -> Pedido:
    """Confirma a retirada do pedido no balcão.

    Quem confere que a pessoa é ela mesma é o balcão, não o sistema: o
    operador tem a lista na tela, chama pelo nome e libera. A trilha guarda
    quem confirmou e quando, que é o que permite voltar atrás numa cobrança
    contestada.
    """
    if not ator.eh_admin:
        raise SemPermissao()
    pedido = sessao.get(Pedido, pedido_id)
    if pedido is None or pedido.status != "pendente":
        raise PedidoNaoPendente()

    pedido.status = "entregue"
    pedido.entregue_em = _agora()
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


def _devolver_ao_estoque(sessao: Session, pedido: Pedido) -> None:
    itens = list(sessao.scalars(select(ItemPedido).where(ItemPedido.pedido_id == pedido.id)))
    itens_com_produto = (item for item in itens if item.produto_id)
    # Mesma ordem da compra: dois cancelamentos com os mesmos produtos não
    # travam um no outro.
    for item in sorted(itens_com_produto, key=lambda item: str(item.produto_id)):
        sessao.execute(
            update(Produto)
            .where(Produto.id == item.produto_id)
            .values(estoque=Produto.estoque + item.quantidade)
        )


def expirar_vencidos(sessao: Session) -> list[Pedido]:
    """Cancela pedidos pendentes velhos demais e devolve o estoque.

    Pendente segura estoque: quem compra e não retira deixa a mercadoria fora
    da prateleira para todo mundo. Sem isto, o número na tela vai ficando
    menor que o da geladeira e ninguém entende por quê.

    Fica como `cancelado` e não como um status novo, para os relatórios e a
    exportação continuarem com uma regra só — "não cancelado conta". O motivo
    e a ação na auditoria distinguem do cancelamento feito por gente.

    Sem ator: quem faz isto é o relógio.
    """
    limite = _agora() - timedelta(hours=_config.pedido_validade_horas)
    vencidos = list(
        sessao.scalars(
            select(Pedido).where(Pedido.status == "pendente", Pedido.criado_em < limite)
        )
    )

    for pedido in vencidos:
        _devolver_ao_estoque(sessao, pedido)
        pedido.status = "cancelado"
        pedido.cancelado_em = _agora()
        pedido.motivo_cancelamento = (
            f"Expirado: não retirado em {_config.pedido_validade_horas}h."
        )
        auditoria.registrar(
            sessao,
            ATOR_RELOGIO,
            acao="pedido.expirado",
            entidade="pedido",
            entidade_id=pedido.id,
            descricao=(
                f"Expirou o pedido {pedido.codigo_retirada} por falta de retirada "
                f"e devolveu os itens ao estoque."
            ),
            dados_anteriores={"status": "pendente"},
            dados_novos={"status": "cancelado", "motivo": "expirado"},
        )
    return vencidos


def cancelar(sessao: Session, ator: Ator, pedido_id: uuid.UUID, motivo: str) -> Pedido:
    if not ator.eh_admin:
        raise SemPermissao()
    pedido = sessao.get(Pedido, pedido_id)
    if pedido is None or pedido.status != "pendente":
        raise PedidoNaoPendente()

    _devolver_ao_estoque(sessao, pedido)

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


@dataclass
class LinhaPedido:
    """Pedido com itens e quem comprou, para a tela de entregas."""

    pedido: Pedido
    itens: list[ItemPedido]
    colaborador_nome: str
    colaborador_codigo: str
    departamento: str | None


def _montar(sessao: Session, consulta) -> list[LinhaPedido]:
    """Executa a consulta e anexa os itens.

    Os itens vêm num SELECT só. Buscar por pedido custaria uma ida ao banco
    por linha da tela — no Neon, cada uma dessas passa de 100 ms, e um mês de
    vendas tem centenas de linhas.
    """
    linhas = sessao.execute(consulta).all()
    if not linhas:
        return []

    por_pedido: dict[uuid.UUID, list[ItemPedido]] = {}
    ids = [pedido.id for pedido, *_ in linhas]
    for item in sessao.scalars(select(ItemPedido).where(ItemPedido.pedido_id.in_(ids))):
        por_pedido.setdefault(item.pedido_id, []).append(item)

    return [
        LinhaPedido(
            pedido=pedido,
            itens=por_pedido.get(pedido.id, []),
            colaborador_nome=nome,
            colaborador_codigo=codigo,
            departamento=dep,
        )
        for pedido, nome, codigo, dep in linhas
    ]


def _com_pessoa():
    return (
        select(Pedido, Colaborador.nome_completo, Colaborador.codigo, Departamento.nome)
        .join(Colaborador, Colaborador.id == Pedido.colaborador_id)
        .outerjoin(Departamento, Departamento.id == Colaborador.departamento_id)
    )


def listar_pendentes_detalhado(sessao: Session, ator: Ator) -> list[LinhaPedido]:
    """O que o balcão de entrega precisa ver: o pedido e o nome de quem retira.

    Expira os vencidos antes de listar. Escrever numa leitura não é bonito,
    mas o alvo é a tela que decide o que está pendente: se ela mostrasse um
    pedido de ontem esperando retirada, o operador entregaria. O mesmo padrão
    já é usado em `almocos.gerar`, pelo mesmo motivo — nada expira sozinho no
    banco, e o primeiro que olha é quem descobre.
    """
    if not ator.eh_admin:
        raise SemPermissao()
    expirar_vencidos(sessao)
    return _montar(
        sessao,
        _com_pessoa().where(Pedido.status == "pendente").order_by(Pedido.criado_em),
    )


def listar_periodo(
    sessao: Session, ator: Ator, de: date, ate: date, status: str | None = None
) -> list[LinhaPedido]:
    """Vendas de um intervalo, para relatório e exportação.

    Datas locais convertidas aqui, e não no router: `criado_em` é UTC, e uma
    compra das 22h já pertence ao dia seguinte lá — sem converter, ela some do
    relatório do dia em que de fato aconteceu.
    """
    if not ator.eh_admin:
        raise SemPermissao()
    if ate < de:
        raise PeriodoInvalido()

    fuso = ZoneInfo(_config.fuso)
    inicio = datetime(de.year, de.month, de.day, tzinfo=fuso).astimezone(UTC)
    fim = (datetime(ate.year, ate.month, ate.day, tzinfo=fuso) + timedelta(days=1)).astimezone(UTC)

    consulta = (
        _com_pessoa()
        .where(Pedido.criado_em >= inicio, Pedido.criado_em < fim)
        .order_by(Pedido.criado_em.desc())
    )
    if status:
        consulta = consulta.where(Pedido.status == status)
    return _montar(sessao, consulta)
