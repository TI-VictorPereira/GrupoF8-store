"""Consumo do próprio colaborador: compras e almoços de uma competência."""

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import obter_config
from app.excecoes import DadosInvalidos
from app.models.operacao import Almoco, ItemPedido, Pedido
from app.modules.auditoria import Ator

_config = obter_config()


@dataclass
class Lancamento:
    id: uuid.UUID
    tipo: str  # "loja" | "almoco"
    data: datetime
    descricao: str
    valor: Decimal
    status: str


@dataclass
class Extrato:
    competencia: str
    total_loja: Decimal
    total_almocos: Decimal
    quantidade_almocos: int
    lancamentos: list[Lancamento]


def _intervalo(competencia: str) -> tuple[datetime, datetime]:
    """Mês local convertido para UTC — o mesmo fuso do resto do sistema."""
    try:
        ano, mes = (int(p) for p in competencia.split("-"))
        primeiro = date(ano, mes, 1)
    except (ValueError, TypeError):
        raise DadosInvalidos("Competência inválida. Use o formato AAAA-MM.") from None

    fuso = ZoneInfo(_config.fuso)
    inicio = datetime(primeiro.year, primeiro.month, 1, tzinfo=fuso)
    proximo = (
        datetime(primeiro.year + 1, 1, 1, tzinfo=fuso)
        if primeiro.month == 12
        else datetime(primeiro.year, primeiro.month + 1, 1, tzinfo=fuso)
    )
    return inicio, proximo


def competencia_atual() -> str:
    hoje = datetime.now(ZoneInfo(_config.fuso))
    return f"{hoje.year:04d}-{hoje.month:02d}"


def meu_extrato(sessao: Session, ator: Ator, competencia: str | None = None) -> Extrato:
    competencia = competencia or competencia_atual()
    inicio, fim = _intervalo(competencia)

    pedidos = list(
        sessao.scalars(
            select(Pedido)
            .where(
                Pedido.colaborador_id == ator.id,
                Pedido.criado_em >= inicio,
                Pedido.criado_em < fim,
            )
            .order_by(Pedido.criado_em.desc())
        )
    )
    itens_por_pedido: dict[uuid.UUID, list[ItemPedido]] = {}
    if pedidos:
        for item in sessao.scalars(
            select(ItemPedido).where(ItemPedido.pedido_id.in_([p.id for p in pedidos]))
        ):
            itens_por_pedido.setdefault(item.pedido_id, []).append(item)

    almocos = list(
        sessao.scalars(
            select(Almoco)
            .where(
                Almoco.colaborador_id == ator.id,
                Almoco.criado_em >= inicio,
                Almoco.criado_em < fim,
            )
            .order_by(Almoco.criado_em.desc())
        )
    )

    lancamentos: list[Lancamento] = []
    total_loja = Decimal("0")
    for pedido in pedidos:
        itens = itens_por_pedido.get(pedido.id, [])
        descricao = ", ".join(f"{i.quantidade}× {i.nome_produto}" for i in itens) or "Compra"
        if pedido.status != "cancelado":
            total_loja += pedido.valor_total
        lancamentos.append(
            Lancamento(
                id=pedido.id,
                tipo="loja",
                data=pedido.criado_em,
                descricao=descricao,
                valor=pedido.valor_total,
                status=pedido.status,
            )
        )

    total_almocos = Decimal("0")
    confirmados = 0
    for almoco in almocos:
        if almoco.status == "confirmado":
            confirmados += 1
            total_almocos += almoco.valor
        lancamentos.append(
            Lancamento(
                id=almoco.id,
                tipo="almoco",
                data=almoco.criado_em,
                descricao="Almoço no refeitório",
                valor=almoco.valor,
                status=almoco.status,
            )
        )

    lancamentos.sort(key=lambda lancamento: lancamento.data, reverse=True)

    return Extrato(
        competencia=competencia,
        total_loja=total_loja,
        total_almocos=total_almocos,
        quantidade_almocos=confirmados,
        lancamentos=lancamentos,
    )


def competencias_disponiveis(sessao: Session, ator: Ator, quantidade: int = 6) -> list[str]:
    """Últimos meses, para o seletor da tela. Não consulta o banco: o extrato
    de um mês sem movimento é simplesmente vazio."""
    fuso = ZoneInfo(_config.fuso)
    referencia = datetime.now(fuso).replace(day=1)
    meses = []
    for _ in range(quantidade):
        meses.append(f"{referencia.year:04d}-{referencia.month:02d}")
        referencia = (referencia - timedelta(days=1)).replace(day=1)
    return meses
