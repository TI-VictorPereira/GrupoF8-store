"""Fechamento da competência: o mês do consumo fecha dia 20, não no último dia.

A competência AAAA-MM vai do dia 21 de MM-1 até o fim do dia 20 de MM, e leva
o nome do mês em que fecha — o mesmo padrão da folha.

É a conta que decide quanto cada pessoa paga e em qual mês, e ela erra em
silêncio: um lançamento no ciclo errado não levanta exceção nenhuma, só
aparece quando alguém confere o desconto.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

from app.core.db import FabricaDeSessao
from app.models.operacao import Pedido
from app.modules import consumo
from app.modules.auditoria import Ator

SP = ZoneInfo("America/Sao_Paulo")


def _local(ano, mes, dia, hora=12, minuto=0) -> datetime:
    return datetime(ano, mes, dia, hora, minuto, tzinfo=SP)


# --- a conta, sem banco ----------------------------------------------------


@pytest.mark.parametrize(
    "momento, esperado",
    [
        # O dia 20 ainda é do ciclo que fecha; o 21 já abre o seguinte.
        (_local(2026, 9, 20, 23, 59), "2026-09"),
        (_local(2026, 9, 21, 0, 1), "2026-10"),
        (_local(2026, 9, 1), "2026-09"),
        # Virada de ano nos dois sentidos.
        (_local(2025, 12, 20), "2025-12"),
        (_local(2025, 12, 21), "2026-01"),
    ],
)
def test_dia_de_corte_decide_a_competencia(momento, esperado):
    assert consumo._competencia_de(momento) == esperado


@pytest.mark.parametrize(
    "competencia, inicio, fim_exclusivo",
    [
        ("2026-09", _local(2026, 8, 21, 0, 0), _local(2026, 9, 21, 0, 0)),
        # Janeiro puxa dezembro do ano anterior.
        ("2026-01", _local(2025, 12, 21, 0, 0), _local(2026, 1, 21, 0, 0)),
        # Fevereiro tem 28 dias e o ciclo começa no 21: mês curto não quebra.
        ("2026-03", _local(2026, 2, 21, 0, 0), _local(2026, 3, 21, 0, 0)),
    ],
)
def test_intervalo_da_competencia(competencia, inicio, fim_exclusivo):
    assert consumo._intervalo(competencia) == (
        inicio.astimezone(UTC),
        fim_exclusivo.astimezone(UTC),
    )


def test_intervalo_e_competencia_sao_inversos():
    """Todo instante cai dentro do intervalo da competência que o reivindica.

    Sem isto, um erro de sinal em `_competencia_de` deixaria um dia órfão:
    nenhuma competência o listaria, e o consumo daquele dia sumiria da conta
    de todo mundo sem nunca dar erro.
    """
    momento = _local(2026, 3, 1)
    while momento < _local(2026, 5, 1):
        inicio, fim = consumo._intervalo(consumo._competencia_de(momento))
        assert inicio <= momento.astimezone(UTC) < fim, momento
        momento = momento.replace(day=momento.day + 1) if momento.day < 28 else (
            momento.replace(month=momento.month + 1, day=1)
        )


def test_competencia_invalida():
    from app.excecoes import CompetenciaInvalida

    for entrada in ["2026-13", "banana", "2026", ""]:
        with pytest.raises(CompetenciaInvalida):
            consumo._intervalo(entrada)


# --- a armadilha do fuso ---------------------------------------------------


def test_compra_da_noite_do_dia_20_fica_no_ciclo_que_fecha(dados):
    """`criado_em` é UTC; às 21h do dia 20 em São Paulo já é dia 21 em UTC.

    Comparar sem converter o fuso jogaria esta compra no ciclo seguinte e
    cobraria a pessoa no mês errado. Este teste é o que segura a conversão no
    lugar.
    """
    ator = Ator(id=dados["ativo"], codigo="T-LOGIN", nome="Fulano", papel="colaborador")

    noite_do_20 = _local(2026, 9, 20, 21, 0)
    assert noite_do_20.astimezone(UTC).day == 21, "premissa do teste: em UTC já virou"

    with FabricaDeSessao() as s:
        s.add(
            Pedido(
                colaborador_id=dados["ativo"],
                empresa_id=dados["empresa"],
                vinculo="clt",
                matricula=1,
                valor_total=Decimal("7.00"),
                codigo_retirada="900001",
                criado_em=noite_do_20,
            )
        )
        s.commit()

    with FabricaDeSessao() as s:
        setembro = consumo.meu_extrato(s, ator, "2026-09")
        outubro = consumo.meu_extrato(s, ator, "2026-10")

    assert setembro.total_loja == Decimal("7.00")
    assert outubro.total_loja == Decimal("0")


def test_o_ciclo_separa_as_compras_na_virada(dados):
    """Duas compras a minutos de distância, em ciclos diferentes."""
    ator = Ator(id=dados["ativo"], codigo="T-LOGIN", nome="Fulano", papel="colaborador")

    with FabricaDeSessao() as s:
        for momento, valor, codigo in [
            (_local(2026, 9, 20, 23, 59), Decimal("3.00"), "900002"),
            (_local(2026, 9, 21, 0, 1), Decimal("5.00"), "900003"),
        ]:
            s.add(
                Pedido(
                    colaborador_id=dados["ativo"],
                    empresa_id=dados["empresa"],
                    vinculo="clt",
                    matricula=1,
                    valor_total=valor,
                    codigo_retirada=codigo,
                    criado_em=momento,
                )
            )
        s.commit()

    with FabricaDeSessao() as s:
        setembro = consumo.meu_extrato(s, ator, "2026-09")
        outubro = consumo.meu_extrato(s, ator, "2026-10")

    assert setembro.total_loja == Decimal("3.00")
    assert outubro.total_loja == Decimal("5.00")


def test_seletor_lista_so_os_ciclos_com_movimento(dados):
    """O seletor sai do banco, não de uma contagem de meses para trás.

    Antes ele listava os últimos seis meses sempre, com ou sem consumo. Quem
    entrou na empresa no mês passado via cinco meses vazios para escolher.
    """
    ator = Ator(id=dados["ativo"], codigo="T-LOGIN", nome="Fulano", papel="colaborador")
    atual = consumo.competencia_atual()

    with FabricaDeSessao() as s:
        # Sem movimento nenhum, só o ciclo aberto — é onde a pessoa está.
        assert consumo.competencias_disponiveis(s, ator) == [atual]

        s.add(
            Pedido(
                colaborador_id=dados["ativo"],
                empresa_id=dados["empresa"],
                vinculo="clt",
                matricula=1,
                valor_total=Decimal("4.00"),
                codigo_retirada="900004",
                criado_em=_local(2026, 3, 5),
            )
        )
        s.commit()

    with FabricaDeSessao() as s:
        meses = consumo.competencias_disponiveis(s, ator)

    # 05/03 pertence ao ciclo que fecha em 20/03.
    assert "2026-03" in meses
    assert meses[0] == atual
    assert meses == sorted(meses, reverse=True)


def test_sql_e_python_concordam_sobre_o_ciclo():
    """As duas contas da mesma regra têm de dar o mesmo em todo instante.

    `_competencia_de` roda em Python para montar o intervalo; `_competencia_sql`
    roda no banco para descobrir quais ciclos têm movimento. Se divergirem, um
    ciclo aparece no seletor e volta vazio quando é aberto.
    """
    from sqlalchemy import DateTime, cast, literal, select

    momento = _local(2026, 1, 1)
    with FabricaDeSessao() as s:
        while momento < _local(2026, 5, 1):
            for hora in (0, 12, 21, 23):
                instante = momento.replace(hour=hora)
                no_banco = s.scalar(
                    select(
                        consumo._competencia_sql(cast(literal(instante), DateTime(timezone=True)))
                    )
                )
                assert no_banco == consumo._competencia_de(instante), instante
            momento += timedelta(days=1)


def test_so_admin_lista_os_ciclos_da_empresa(dados):
    from app.excecoes import SemPermissao

    comum = Ator(id=dados["ativo"], codigo="T-LOGIN", nome="Fulano", papel="colaborador")
    with FabricaDeSessao() as s, pytest.raises(SemPermissao):
        consumo.competencias_da_empresa(s, comum)
