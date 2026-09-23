"""Preço do almoço: vigência, correção e o congelamento no almoço lançado."""

from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy import delete, select

from app.core.db import FabricaDeSessao
from app.excecoes import SemPermissao, ValorNegativo
from app.models.auditoria import LogAuditoria
from app.models.cadastro import Colaborador, PrecoAlmoco
from app.models.operacao import Almoco
from app.modules import almocos, precos
from app.modules.auditoria import Ator

ADMIN = Ator(id=None, codigo="teste", nome="Admin de Teste", papel="admin")


@pytest.fixture(autouse=True)
def _preservar_precos():
    """A tabela de preços é única para o sistema inteiro, não por empresa.

    Sem devolver o que estava lá, um teste daqui muda o valor que todos os
    outros usam — e a falha aparece longe, num teste que nada tem a ver com
    preço.
    """
    with FabricaDeSessao() as s:
        antes = {
            preco.id: (preco.valor, preco.vigencia_fim)
            for preco in s.scalars(select(PrecoAlmoco))
        }

    yield

    with FabricaDeSessao() as s:
        s.execute(delete(PrecoAlmoco).where(PrecoAlmoco.id.notin_(antes) if antes else True))
        for preco in s.scalars(select(PrecoAlmoco)):
            preco.valor, preco.vigencia_fim = antes[preco.id]
        s.execute(delete(LogAuditoria).where(LogAuditoria.entidade == "preco_almoco"))
        s.commit()


def test_vigencia_nova_fecha_a_anterior_na_vespera(dados):
    hoje = precos.hoje_local()
    ontem = hoje - timedelta(days=1)

    with FabricaDeSessao() as s:
        s.execute(delete(PrecoAlmoco))
        precos.definir(s, ADMIN, Decimal("15.00"), ontem)
        s.commit()

        precos.definir(s, ADMIN, Decimal("18.00"), hoje)
        s.commit()

        vigencias = list(s.scalars(select(PrecoAlmoco).order_by(PrecoAlmoco.vigencia_inicio)))
        assert [p.valor for p in vigencias] == [Decimal("15.00"), Decimal("18.00")]
        assert vigencias[0].vigencia_fim == ontem
        assert vigencias[1].vigencia_fim is None

        # Consultar o passado continua devolvendo o preço do passado: é disso
        # que a exportação de um mês fechado depende.
        assert precos.valor_vigente(s, ontem) == Decimal("15.00")
        assert precos.valor_vigente(s, hoje) == Decimal("18.00")


def test_mudanca_no_mesmo_dia_corrige_em_vez_de_abrir_outra(dados):
    """Duas vigências começando no mesmo dia deixariam o preço do dia
    dependendo do desempate da consulta — e fechar a anterior na véspera daria
    um fim anterior ao início, que o CHECK recusa."""
    hoje = precos.hoje_local()

    with FabricaDeSessao() as s:
        s.execute(delete(PrecoAlmoco))
        precos.definir(s, ADMIN, Decimal("18.00"), hoje)
        precos.definir(s, ADMIN, Decimal("19.50"), hoje)
        s.commit()

        todas = list(s.scalars(select(PrecoAlmoco)))
        assert len(todas) == 1
        assert todas[0].valor == Decimal("19.50")
        assert todas[0].vigencia_inicio == hoje


def test_almoco_ja_lancado_nao_muda_de_valor(dados):
    """O valor é copiado para dentro do almoço na criação. Se a mudança de
    preço alcançasse o que já passou, reexportar um mês fechado daria outro
    número."""
    hoje = precos.hoje_local()

    with FabricaDeSessao() as s:
        s.execute(delete(PrecoAlmoco))
        s.execute(delete(Almoco).where(Almoco.colaborador_id == dados["ativo"]))
        precos.definir(s, ADMIN, Decimal("18.00"), hoje)
        s.commit()

        pessoa = s.get(Colaborador, dados["ativo"])
        ator = Ator(
            id=pessoa.id, codigo=pessoa.codigo, nome=pessoa.nome_completo, papel="colaborador"
        )
        almoco = almocos.gerar(s, ator)
        s.commit()
        almoco_id = almoco.id
        assert almoco.valor == Decimal("18.00")

        precos.definir(s, ADMIN, Decimal("25.00"), hoje)
        s.commit()

        s.expire_all()
        assert s.get(Almoco, almoco_id).valor == Decimal("18.00")

    with FabricaDeSessao() as s:
        s.execute(delete(Almoco).where(Almoco.colaborador_id == dados["ativo"]))
        s.commit()


def test_definicao_fica_na_auditoria(dados):
    with FabricaDeSessao() as s:
        s.execute(delete(PrecoAlmoco))
        novo = precos.definir(s, ADMIN, Decimal("18.00"))
        s.commit()

        registro = s.scalar(
            select(LogAuditoria).where(
                LogAuditoria.entidade == "preco_almoco",
                LogAuditoria.entidade_id == novo.id,
            )
        )
        assert registro is not None
        assert registro.acao == "preco_almoco.definido"
        assert registro.dados_novos["valor"] == "18.00"


def test_so_admin_define_e_valor_negativo_e_recusado(dados):
    with FabricaDeSessao() as s:
        comum = Ator(id=dados["ativo"], codigo="x", nome="x", papel="colaborador")
        with pytest.raises(SemPermissao):
            precos.definir(s, comum, Decimal("18.00"))
        with pytest.raises(ValorNegativo):
            precos.definir(s, ADMIN, Decimal("-1.00"))


def test_sem_preco_cadastrado_o_valor_e_zero(dados):
    """Não é um caso hipotético: é o estado em que o sistema nasce."""
    with FabricaDeSessao() as s:
        s.execute(delete(PrecoAlmoco))
        s.flush()
        assert precos.vigente(s) is None
        assert precos.valor_vigente(s) == Decimal("0")
        s.rollback()
