"""Consumo do próprio colaborador: compras e almoços de uma competência."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import obter_config
from app.excecoes import CompetenciaInvalida, SemPermissao
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


DIA_CORTE = 20


def _competencia_de(momento_local: datetime) -> str:
    """A que ciclo um instante local pertence.

    O mês fecha no dia 20 e o seguinte abre no 21, então a partir do dia 21
    tudo já conta para o mês seguinte. O rótulo é o mês em que o ciclo fecha,
    como na folha.
    """
    ano, mes = momento_local.year, momento_local.month
    if momento_local.day > DIA_CORTE:
        ano, mes = (ano + 1, 1) if mes == 12 else (ano, mes + 1)
    return f"{ano:04d}-{mes:02d}"


def _intervalo(competencia: str) -> tuple[datetime, datetime]:
    """Ciclo local convertido para UTC, com o fim exclusivo.

    A competência AAAA-MM vai do dia 21 de MM-1 até o fim do dia 20 de MM.

    """
    try:
        ano, mes = (int(parte) for parte in competencia.split("-"))
        if not 1 <= mes <= 12:
            raise ValueError
    except (ValueError, TypeError):
        raise CompetenciaInvalida() from None

    fuso = ZoneInfo(_config.fuso)
    ano_inicio, mes_inicio = (ano - 1, 12) if mes == 1 else (ano, mes - 1)
    inicio = datetime(ano_inicio, mes_inicio, DIA_CORTE + 1, tzinfo=fuso)
    fim = datetime(ano, mes, DIA_CORTE + 1, tzinfo=fuso)
    return inicio.astimezone(UTC), fim.astimezone(UTC)


def competencia_atual() -> str:
    return _competencia_de(datetime.now(ZoneInfo(_config.fuso)))


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


def _competencia_sql(coluna):
    """Competência de um `criado_em`, calculada no banco.

    Subtrair o dia de corte joga tudo que pertence ao ciclo para dentro do mês
    em que ele começou: o dia 20 cai no último dia do mês anterior, o dia 21
    cai no dia 1. Somar um mês devolve o rótulo, que é o mês em que fecha.

    A conta é feita com datas, não com o número do dia — é isso que faz
    fevereiro e os meses de 30 dias funcionarem sem caso especial. E o
    `timezone` na entrada é o mesmo cuidado de `_intervalo`: sem ele, a compra
    das 21h do dia 20 é contada no ciclo seguinte.
    """
    local = func.timezone(_config.fuso, coluna)
    inicio_do_ciclo = func.date_trunc("month", local - func.make_interval(0, 0, 0, DIA_CORTE))
    return func.to_char(inicio_do_ciclo + func.make_interval(0, 1), "YYYY-MM")


def _com_movimento(sessao: Session, colaborador_id: uuid.UUID | None = None) -> list[str]:
    """Ciclos que têm pedido ou almoço. Sem `colaborador_id`, os de todo mundo."""
    achadas = {competencia_atual()}
    for tabela in (Pedido, Almoco):
        consulta = select(_competencia_sql(tabela.criado_em)).distinct()
        if colaborador_id is not None:
            consulta = consulta.where(tabela.colaborador_id == colaborador_id)
        achadas.update(sessao.scalars(consulta))
    return sorted(achadas, reverse=True)


def competencias_da_empresa(sessao: Session, ator: Ator) -> list[str]:
    """Ciclos com movimento de qualquer pessoa. Base do seletor de exportação."""
    if not ator.eh_admin:
        raise SemPermissao()
    return _com_movimento(sessao)


def competencias_disponiveis(sessao: Session, ator: Ator) -> list[str]:
    """Ciclos em que esta pessoa teve movimento, do mais recente para o mais antigo.

    O ciclo aberto entra sempre, mesmo vazio: é onde a pessoa está, e no dia
    21 o seletor ficaria sem nenhuma opção até a primeira compra.
    """
    return _com_movimento(sessao, colaborador_id=ator.id)
