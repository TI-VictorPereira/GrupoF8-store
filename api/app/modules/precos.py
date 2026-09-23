"""Preço do almoço, com vigência.

O valor é copiado para dentro do almoço no momento em que ele é criado, e não
lido de volta depois. É isso que faz o histórico parar de pé: mudar o preço
hoje não reescreve o que foi consumido no mês passado.

A contrapartida é que preço errado sai caro. Cada almoço criado enquanto o
valor estiver zerado vale zero para sempre, e corrigir o cadastro depois não
alcança o que já foi gravado.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import obter_config
from app.excecoes import SemPermissao, ValorNegativo
from app.models.cadastro import PrecoAlmoco
from app.modules import auditoria
from app.modules.auditoria import Ator

_config = obter_config()


def hoje_local() -> date:
    return datetime.now(ZoneInfo(_config.fuso)).date()


def vigente(sessao: Session, dia: date | None = None) -> PrecoAlmoco | None:
    """A vigência que cobre o dia. Sem nenhuma cadastrada, devolve None."""
    dia = dia or hoje_local()
    return sessao.scalar(
        select(PrecoAlmoco)
        .where(
            PrecoAlmoco.vigencia_inicio <= dia,
            (PrecoAlmoco.vigencia_fim.is_(None)) | (PrecoAlmoco.vigencia_fim >= dia),
        )
        .order_by(PrecoAlmoco.vigencia_inicio.desc())
    )


def valor_vigente(sessao: Session, dia: date | None = None) -> Decimal:
    preco = vigente(sessao, dia)
    return preco.valor if preco else Decimal("0")


def historico(sessao: Session, ator: Ator) -> list[PrecoAlmoco]:
    if not ator.eh_admin:
        raise SemPermissao()
    return list(sessao.scalars(select(PrecoAlmoco).order_by(PrecoAlmoco.vigencia_inicio.desc())))


def definir(
    sessao: Session, ator: Ator, valor: Decimal, inicio: date | None = None
) -> PrecoAlmoco:
    """Abre uma vigência nova e fecha a anterior na véspera."""
    if not ator.eh_admin:
        raise SemPermissao()
    if valor < 0:
        raise ValorNegativo()

    inicio = inicio or hoje_local()
    anterior = vigente(sessao, inicio)

    if anterior is not None and anterior.vigencia_inicio == inicio:
        de = anterior.valor
        if de == valor:
            return anterior
        anterior.valor = valor
        auditoria.registrar(
            sessao,
            ator,
            acao="preco_almoco.corrigido",
            entidade="preco_almoco",
            entidade_id=anterior.id,
            descricao=f"Corrigiu o preço do almoço de {de} para {valor}.",
            dados_anteriores={"valor": str(de)},
            dados_novos={"valor": str(valor)},
        )
        return anterior

    if anterior is not None:
        anterior.vigencia_fim = inicio - timedelta(days=1)

    novo = PrecoAlmoco(valor=valor, vigencia_inicio=inicio, criado_por=ator.id)
    sessao.add(novo)
    sessao.flush()

    auditoria.registrar(
        sessao,
        ator,
        acao="preco_almoco.definido",
        entidade="preco_almoco",
        entidade_id=novo.id,
        descricao=f"Definiu o preço do almoço em {valor} a partir de {inicio:%d/%m/%Y}.",
        dados_anteriores={"valor": str(anterior.valor)} if anterior else None,
        dados_novos={"valor": str(valor), "vigencia_inicio": inicio.isoformat()},
    )
    return novo
