"""Consumo do próprio colaborador: compras e almoços de uma competência."""

import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import FabricaDeSessao
from app.excecoes import SemPermissao
from app.models.cadastro import Colaborador
from app.models.operacao import Almoco, ItemPedido, Pedido
from app.modules import ciclo
from app.modules.auditoria import Ator


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
    limite_loja: Decimal | None = None
    disponivel_loja: Decimal | None = None


def competencia_atual(sessao: Session | None = None) -> str:
    if sessao is None:
        with FabricaDeSessao() as propria:
            return ciclo.competencia_de(None, ciclo.regras(propria))
    return ciclo.competencia_de(None, ciclo.regras(sessao))


def intervalo_da_competencia(
    competencia: str, sessao: Session | None = None
) -> tuple[datetime, datetime]:
    """O ciclo em UTC, fim exclusivo. Só para exibir e para saber se já fechou:
    quem pertence a qual ciclo é decidido pela coluna `competencia`."""
    if sessao is None:
        with FabricaDeSessao() as propria:
            return ciclo.intervalo(competencia, ciclo.regras(propria))
    return ciclo.intervalo(competencia, ciclo.regras(sessao))


def gasto_na_loja(sessao: Session, colaborador_id: uuid.UUID, competencia: str) -> Decimal:
    """O que a pessoa já comprou na loja no ciclo. Cancelado não conta."""
    return sessao.scalar(
        select(func.coalesce(func.sum(Pedido.valor_total), 0)).where(
            Pedido.colaborador_id == colaborador_id,
            Pedido.competencia == competencia,
            Pedido.status != "cancelado",
        )
    ) or Decimal("0")


def meu_extrato(sessao: Session, ator: Ator, competencia: str | None = None) -> Extrato:
    competencia = competencia or competencia_atual(sessao)
    ciclo.validar(competencia)

    pedidos = list(
        sessao.scalars(
            select(Pedido)
            .where(
                Pedido.colaborador_id == ator.id,
                Pedido.competencia == competencia,
                Pedido.status != "cancelado",
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
                Almoco.competencia == competencia,
                Almoco.status == "confirmado",
            )
            .order_by(Almoco.criado_em.desc())
        )
    )

    lancamentos: list[Lancamento] = []
    total_loja = Decimal("0")
    for pedido in pedidos:
        itens = itens_por_pedido.get(pedido.id, [])
        descricao = ", ".join(f"{i.quantidade}× {i.nome_produto}" for i in itens) or "Compra"
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

    # O limite só faz sentido no ciclo aberto: nos passados já não há o que gastar.
    limite = sessao.scalar(select(Colaborador.limite_mensal).where(Colaborador.id == ator.id))
    no_ciclo_aberto = competencia == competencia_atual(sessao)

    return Extrato(
        competencia=competencia,
        total_loja=total_loja,
        total_almocos=total_almocos,
        quantidade_almocos=confirmados,
        lancamentos=lancamentos,
        limite_loja=limite if no_ciclo_aberto else None,
        disponivel_loja=max(limite - total_loja, Decimal("0"))
        if no_ciclo_aberto and limite is not None
        else None,
    )


def _com_movimento(sessao: Session, colaborador_id: uuid.UUID | None = None) -> list[str]:
    """Ciclos que têm pedido ou almoço. Sem `colaborador_id`, os de todo mundo."""
    achadas = {competencia_atual(sessao)}
    for tabela in (Pedido, Almoco):
        consulta = select(tabela.competencia).distinct()
        if colaborador_id is not None:
            consulta = consulta.where(tabela.colaborador_id == colaborador_id)
        achadas.update(sessao.scalars(consulta))
    return sorted(achadas, reverse=True)


def competencias_da_empresa(sessao: Session, ator: Ator) -> list[str]:
    """Ciclos com movimento de qualquer pessoa. Base do seletor de exportação."""
    if ator.papel not in {"admin", "dp"}:
        raise SemPermissao()
    return _com_movimento(sessao)


def competencias_disponiveis(sessao: Session, ator: Ator) -> list[str]:
    """Ciclos em que esta pessoa teve movimento, do mais recente para o mais antigo.

    O ciclo aberto entra sempre, mesmo vazio: é onde a pessoa está, e no dia
    21 o seletor ficaria sem nenhuma opção até a primeira compra.
    """
    return _com_movimento(sessao, colaborador_id=ator.id)
