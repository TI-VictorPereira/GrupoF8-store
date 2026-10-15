"""Ciclo de consumo: em que competência cada instante cai, com o dia de corte
guardado no banco e com vigência.

A competência AAAA-MM leva o nome do mês em que o ciclo fecha. Com corte no
dia 15, vai do dia 16 do mês anterior até o fim do dia 15. Pedidos e almoços
gravam a competência na criação, então trocar o dia só afeta dali pra frente.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import obter_config
from app.excecoes import CompetenciaInvalida, DadosInvalidos, SemPermissao
from app.models.cadastro import CorteCiclo
from app.modules import auditoria
from app.modules.auditoria import Ator

_fuso = ZoneInfo(obter_config().fuso)


@dataclass(frozen=True)
class Regra:
    dia: int
    primeira_competencia: str
    vigente_desde: datetime


def regras(conexao) -> list[Regra]:
    """Aceita Session ou Connection: o carimbo do insert só tem a conexão."""
    linhas = conexao.execute(
        select(CorteCiclo.dia, CorteCiclo.primeira_competencia, CorteCiclo.vigente_desde)
        .order_by(CorteCiclo.vigente_desde)
    ).all()
    return [Regra(*linha) for linha in linhas]


def _seguinte(competencia: str) -> str:
    ano, mes = (int(parte) for parte in competencia.split("-"))
    return f"{ano + 1:04d}-01" if mes == 12 else f"{ano:04d}-{mes + 1:02d}"


def validar(competencia: str) -> tuple[int, int]:
    try:
        ano, mes = (int(parte) for parte in competencia.split("-"))
        if not 1 <= mes <= 12:
            raise ValueError
    except (ValueError, TypeError, AttributeError):
        raise CompetenciaInvalida() from None
    return ano, mes


def competencia_de(momento: datetime | None, lista: list[Regra]) -> str:
    momento = momento or datetime.now(UTC)
    vigentes = [regra for regra in lista if regra.vigente_desde <= momento]
    regra = vigentes[-1] if vigentes else lista[0]
    local = momento.astimezone(_fuso)
    rotulo = f"{local.year:04d}-{local.month:02d}"
    if local.day > regra.dia:
        rotulo = _seguinte(rotulo)
    # Na troca de dia, o primeiro ciclo da regra nova nunca repete um rótulo
    # que a regra anterior já usou.
    return max(rotulo, regra.primeira_competencia)


def intervalo(competencia: str, lista: list[Regra]) -> tuple[datetime, datetime]:
    """Ciclo em UTC, fim exclusivo. Varre os dias em volta do mês: com troca
    de regra no meio, o ciclo pode ser mais curto ou mais longo que um mês."""
    ano, mes = validar(competencia)
    dia = date(ano, mes, 1) - timedelta(days=62)
    ultimo = date(ano, mes, 28) + timedelta(days=35)
    dias: list[date] = []
    while dia <= ultimo:
        meia_noite = datetime.combine(dia, time(), _fuso)
        if competencia_de(meia_noite, lista) == competencia:
            dias.append(dia)
        dia += timedelta(days=1)
    if not dias:
        raise CompetenciaInvalida()
    inicio = datetime.combine(dias[0], time(), _fuso)
    fim = datetime.combine(dias[-1] + timedelta(days=1), time(), _fuso)
    return inicio.astimezone(UTC), fim.astimezone(UTC)


class DiaDeCorteInvalido(DadosInvalidos):
    codigo = "dia_de_corte_invalido"
    mensagem = "O dia de fechamento precisa estar entre 1 e 27."


def alterar(sessao: Session, ator: Ator, dia: int) -> list[Regra]:
    """O dia novo vale a partir do próximo ciclo; o ciclo aberto fecha como
    começou. Uma troca ainda não vigente é substituída pela nova."""
    if not ator.eh_admin:
        raise SemPermissao()
    if not 1 <= dia <= 27:
        raise DiaDeCorteInvalido()

    agora = datetime.now(UTC)
    sessao.execute(delete(CorteCiclo).where(CorteCiclo.vigente_desde > agora))
    sessao.flush()
    lista = regras(sessao)
    atual = competencia_de(agora, lista)
    _, fim_do_atual = intervalo(atual, lista)

    if lista[-1].dia != dia:
        sessao.add(
            CorteCiclo(
                dia=dia,
                primeira_competencia=_seguinte(atual),
                vigente_desde=fim_do_atual,
                criado_por=ator.id,
            )
        )
        auditoria.registrar(
            sessao,
            ator,
            acao="ciclo.corte_alterado",
            entidade="corte_ciclo",
            entidade_id=None,
            descricao=f"Dia de fechamento passa a {dia} a partir da competência {_seguinte(atual)}.",
            dados_novos={"dia": dia, "primeira_competencia": _seguinte(atual)},
        )
        sessao.flush()
    return regras(sessao)
