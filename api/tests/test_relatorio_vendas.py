"""Relatório de vendas por empresa: só entregue/confirmado, aba separada."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from io import BytesIO

import pytest
from openpyxl import load_workbook
from sqlalchemy import delete, select

from app.core import contexto, seguranca
from app.core.db import FabricaDeSessao
from app.excecoes import SemPermissao
from app.models.cadastro import Colaborador, Empresa
from app.models.operacao import Almoco, ItemPedido, Pedido
from app.modules import relatorio_vendas
from app.modules.auditoria import Ator
from tests.conftest import SENHA

PREFIXO = "T-REL-"


@pytest.fixture(autouse=True)
def _contexto_de_teste():
    contexto.definir(correlacao_id=uuid.uuid4(), ip=None, user_agent=None)


@pytest.fixture
def colaborador_empresa_17():
    """A empresa 17 já vem da migration de dados iniciais — o teste usa a
    real, só cria (e depois apaga) o colaborador e os lançamentos."""
    with FabricaDeSessao() as s:
        empresa = s.scalar(
            select(Empresa).where(Empresa.codemp == relatorio_vendas.CODEMP_EMPRESA_SEPARADA)
        )
        assert empresa is not None, "empresa 17 deveria vir da migration de dados iniciais"
        pessoa = Colaborador(
            nome_completo="Pessoa da Empresa 17",
            codigo=f"{PREFIXO}17",
            codparc=uuid.uuid4().int % 100000 + 800000,
            vinculo="clt",
            matricula=uuid.uuid4().int % 100000 + 800000,
            empresa_id=empresa.id,
            papel="colaborador",
            senha_hash=seguranca.gerar_hash(SENHA),
        )
        s.add(pessoa)
        s.commit()
        ids = {"colaborador": pessoa.id, "empresa": empresa.id}

    yield ids

    with FabricaDeSessao() as s:
        s.execute(delete(Pedido).where(Pedido.colaborador_id == ids["colaborador"]))
        s.execute(delete(Almoco).where(Almoco.colaborador_id == ids["colaborador"]))
        s.execute(delete(Colaborador).where(Colaborador.id == ids["colaborador"]))
        s.commit()


def _admin() -> Ator:
    return Ator(id=None, codigo="admin-teste", nome="Admin", papel="admin")


def _pedido_entregue(colaborador_id, empresa_id) -> uuid.UUID:
    with FabricaDeSessao() as s:
        colaborador = s.get(Colaborador, colaborador_id)
        pedido = Pedido(
            colaborador_id=colaborador_id,
            empresa_id=empresa_id,
            vinculo=colaborador.vinculo,
            matricula=colaborador.matricula,
            valor_total=Decimal("10.00"),
            status="entregue",
            codigo_retirada=f"{uuid.uuid4().int % 999999:06d}",
        )
        s.add(pedido)
        s.flush()
        s.add(
            ItemPedido(
                pedido_id=pedido.id,
                nome_produto="Refrigerante",
                quantidade=2,
                preco_unitario=Decimal("5.00"),
                custo_unitario=Decimal("2.00"),
            )
        )
        s.commit()
        return pedido.id


def test_planilha_separa_empresa_17_em_aba_propria(dados, colaborador_empresa_17):
    de = datetime.now(UTC).date()
    ate = de

    _pedido_entregue(dados["ativo"], dados["empresa"])
    _pedido_entregue(colaborador_empresa_17["colaborador"], colaborador_empresa_17["empresa"])

    with FabricaDeSessao() as s:
        linhas = relatorio_vendas.montar(s, _admin(), de, ate)

    nomes_nas_linhas = {linha.colaborador_nome for linha in linhas}
    assert "Fulano de Teste" in nomes_nas_linhas
    assert "Pessoa da Empresa 17" in nomes_nas_linhas

    livro = load_workbook(BytesIO(relatorio_vendas.planilha(linhas)))
    assert livro.sheetnames == ["Empresas", "Empresa 17"]

    aba_demais = livro["Empresas"]
    nomes_demais = [linha[1].value for linha in aba_demais.iter_rows(min_row=2)]
    assert "Fulano de Teste" in nomes_demais
    assert "Pessoa da Empresa 17" not in nomes_demais

    aba_17 = livro["Empresa 17"]
    nomes_17 = [linha[1].value for linha in aba_17.iter_rows(min_row=2)]
    assert nomes_17 == ["Pessoa da Empresa 17"]


def test_pedido_pendente_nao_entra_no_relatorio(dados):
    de = datetime.now(UTC).date()
    with FabricaDeSessao() as s:
        colaborador = s.get(Colaborador, dados["ativo"])
        pedido = Pedido(
            colaborador_id=dados["ativo"],
            empresa_id=dados["empresa"],
            vinculo=colaborador.vinculo,
            matricula=colaborador.matricula,
            valor_total=Decimal("10.00"),
            status="pendente",
            codigo_retirada=f"{uuid.uuid4().int % 999999:06d}",
        )
        s.add(pedido)
        s.commit()

        linhas = relatorio_vendas.montar(s, _admin(), de, de)
        assert linhas == []


def test_colaborador_comum_nao_acessa_o_relatorio(dados):
    comum = Ator(id=dados["ativo"], codigo="x", nome="x", papel="colaborador")
    with FabricaDeSessao() as s:
        with pytest.raises(SemPermissao):
            relatorio_vendas.montar(s, comum, datetime.now(UTC).date(), datetime.now(UTC).date())
