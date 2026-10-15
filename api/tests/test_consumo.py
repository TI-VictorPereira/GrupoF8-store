"""Fechamento da competência: o mês do consumo fecha dia 15, não no último dia.

A competência AAAA-MM vai do dia 16 de MM-1 até o fim do dia 15 de MM, e leva
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
from app.modules import ciclo, consumo
from app.modules.auditoria import Ator

SP = ZoneInfo("America/Sao_Paulo")
CORTE_15 = [ciclo.Regra(15, "2000-01", datetime(2000, 1, 1, tzinfo=UTC))]


def _local(ano, mes, dia, hora=12, minuto=0) -> datetime:
    return datetime(ano, mes, dia, hora, minuto, tzinfo=SP)


# --- a conta, sem banco ----------------------------------------------------


@pytest.mark.parametrize(
    "momento, esperado",
    [
        # O dia 15 ainda é do ciclo que fecha; o 16 já abre o seguinte.
        (_local(2026, 9, 15, 23, 59), "2026-09"),
        (_local(2026, 9, 16, 0, 1), "2026-10"),
        (_local(2026, 9, 1), "2026-09"),
        # Virada de ano nos dois sentidos.
        (_local(2025, 12, 15), "2025-12"),
        (_local(2025, 12, 16), "2026-01"),
    ],
)
def test_dia_de_corte_decide_a_competencia(momento, esperado):
    assert ciclo.competencia_de(momento, CORTE_15) == esperado


@pytest.mark.parametrize(
    "competencia, inicio, fim_exclusivo",
    [
        ("2026-09", _local(2026, 8, 16, 0, 0), _local(2026, 9, 16, 0, 0)),
        # Janeiro puxa dezembro do ano anterior.
        ("2026-01", _local(2025, 12, 16, 0, 0), _local(2026, 1, 16, 0, 0)),
        # Fevereiro tem 28 dias e o ciclo começa no 16: mês curto não quebra.
        ("2026-03", _local(2026, 2, 16, 0, 0), _local(2026, 3, 16, 0, 0)),
    ],
)
def test_intervalo_da_competencia(competencia, inicio, fim_exclusivo):
    assert ciclo.intervalo(competencia, CORTE_15) == (
        inicio.astimezone(UTC),
        fim_exclusivo.astimezone(UTC),
    )


def test_intervalo_e_competencia_sao_inversos():
    """Todo instante cai dentro do intervalo da competência que o reivindica.

    Sem isto, um erro de sinal em `competencia_de` deixaria um dia órfão:
    nenhuma competência o listaria, e o consumo daquele dia sumiria da conta
    de todo mundo sem nunca dar erro.
    """
    momento = _local(2026, 3, 1)
    while momento < _local(2026, 5, 1):
        inicio, fim = ciclo.intervalo(ciclo.competencia_de(momento, CORTE_15), CORTE_15)
        assert inicio <= momento.astimezone(UTC) < fim, momento
        momento = momento.replace(day=momento.day + 1) if momento.day < 28 else (
            momento.replace(month=momento.month + 1, day=1)
        )


def test_competencia_invalida():
    from app.excecoes import CompetenciaInvalida

    for entrada in ["2026-13", "banana", "2026", ""]:
        with pytest.raises(CompetenciaInvalida):
            ciclo.intervalo(entrada, CORTE_15)


# --- a armadilha do fuso ---------------------------------------------------


def test_compra_da_noite_do_dia_15_fica_no_ciclo_que_fecha(dados):
    """`criado_em` é UTC; às 21h do dia 15 em São Paulo já é dia 16 em UTC.

    Comparar sem converter o fuso jogaria esta compra no ciclo seguinte e
    cobraria a pessoa no mês errado. Este teste é o que segura a conversão no
    lugar.
    """
    ator = Ator(id=dados["ativo"], codigo="T-LOGIN", nome="Fulano", papel="colaborador")

    noite_do_15 = _local(2026, 9, 15, 21, 0)
    assert noite_do_15.astimezone(UTC).day == 16, "premissa do teste: em UTC já virou"

    with FabricaDeSessao() as s:
        s.add(
            Pedido(
                colaborador_id=dados["ativo"],
                empresa_id=dados["empresa"],
                vinculo="clt",
                matricula=1,
                valor_total=Decimal("7.00"),
                codigo_retirada="900001",
                criado_em=noite_do_15,
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
            (_local(2026, 9, 15, 23, 59), Decimal("3.00"), "900002"),
            (_local(2026, 9, 16, 0, 1), Decimal("5.00"), "900003"),
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

    # 05/03 pertence ao ciclo que fecha em 15/03.
    assert "2026-03" in meses
    assert meses[0] == atual
    assert meses == sorted(meses, reverse=True)


def test_troca_de_dia_nao_repete_nem_pula_ciclo():
    """Mudar o corte de 15 para 20 e depois para 10: todo dia cai em exatamente
    uma competência, e os rótulos nunca andam para trás."""
    regras = [
        *CORTE_15,
        ciclo.Regra(20, "2026-11", _local(2026, 10, 16, 0, 0)),
        ciclo.Regra(10, "2027-02", _local(2027, 1, 21, 0, 0)),
    ]
    momento, anterior = _local(2026, 9, 1), ""
    while momento < _local(2027, 4, 1):
        competencia = ciclo.competencia_de(momento, regras)
        assert competencia >= anterior, momento
        inicio, fim = ciclo.intervalo(competencia, regras)
        assert inicio <= momento.astimezone(UTC) < fim, momento
        momento, anterior = momento + timedelta(days=1), competencia
    # O ciclo de novembro absorve 16/10 a 20/11: o de outubro não reabre.
    assert ciclo.competencia_de(_local(2026, 10, 16), regras) == "2026-11"

def test_so_admin_lista_os_ciclos_da_empresa(dados):
    from app.excecoes import SemPermissao

    comum = Ator(id=dados["ativo"], codigo="T-LOGIN", nome="Fulano", papel="colaborador")
    with FabricaDeSessao() as s, pytest.raises(SemPermissao):
        consumo.competencias_da_empresa(s, comum)


def test_almoco_expirado_nao_aparece_no_extrato(dados):
    """Código gerado e não usado não é lançamento.

    """
    from app.models.operacao import Almoco

    ator = Ator(id=dados["ativo"], codigo="T-LOGIN", nome="Fulano", papel="colaborador")

    def almoco(dia: int, status: str, codigo: str) -> Almoco:
        momento = _local(2026, 9, 10 + dia)
        return Almoco(
            colaborador_id=dados["ativo"],
            empresa_id=dados["empresa"],
            vinculo="clt",
            matricula=1,
            codigo_barras=codigo,
            status=status,
            origem="totem",
            valor=Decimal("15.00"),
            criado_em=momento,
            expira_em=momento + timedelta(hours=12),
            confirmado_em=momento if status == "confirmado" else None,
        )

    with FabricaDeSessao() as s:
        s.add_all(
            [
                almoco(0, "expirado", "90000000000001"),
                almoco(1, "confirmado", "90000000000002"),
            ]
        )
        s.commit()

    with FabricaDeSessao() as s:
        extrato = consumo.meu_extrato(s, ator, "2026-09")

    tipos = [(l.tipo, l.status) for l in extrato.lancamentos]
    assert ("almoco", "expirado") not in tipos
    assert ("almoco", "confirmado") in tipos
    assert extrato.quantidade_almocos == 1


def test_pedido_cancelado_nao_aparece_no_extrato(dados):
    """Compra cancelada teve o estoque devolvido e o valor estornado."""
    ator = Ator(id=dados["ativo"], codigo="T-LOGIN", nome="Fulano", papel="colaborador")

    with FabricaDeSessao() as s:
        for status, valor, codigo in [
            ("cancelado", Decimal("9.00"), "900010"),
            ("entregue", Decimal("6.00"), "900011"),
        ]:
            s.add(
                Pedido(
                    colaborador_id=dados["ativo"],
                    empresa_id=dados["empresa"],
                    vinculo="clt",
                    matricula=1,
                    valor_total=valor,
                    status=status,
                    codigo_retirada=codigo,
                    criado_em=_local(2026, 9, 12),
                )
            )
        s.commit()

    with FabricaDeSessao() as s:
        extrato = consumo.meu_extrato(s, ator, "2026-09")

    assert [l.status for l in extrato.lancamentos] == ["entregue"]
    assert extrato.total_loja == Decimal("6.00")

    # A lista fecha com o total: é isto que faz o extrato ser conferível.
    soma = sum(l.valor for l in extrato.lancamentos if l.tipo == "loja")
    assert soma == extrato.total_loja
