"""Exportação para a folha do Sankhya: colunas, tipos de célula e recorte.

O Sankhya lê a tipagem da célula na importação, então aqui não basta conferir
o nome da coluna: o teste reabre o arquivo gerado e verifica de que tipo cada
valor saiu.
"""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from io import BytesIO

import pytest
from openpyxl import load_workbook
from sqlalchemy import delete

from app.core.db import FabricaDeSessao
from app.excecoes import SemPermissao
from app.models.cadastro import Colaborador, Empresa
from app.models.operacao import Almoco, Pedido
from app.modules import consumo, folha
from app.modules.auditoria import Ator
from app.routers.exportacoes import PLANILHA
from tests.conftest import CODIGO, SENHA

ADMIN = Ator(id=None, codigo="teste", nome="Admin de Teste", papel="admin")


@pytest.fixture
def movimento(dados):
    """Uma compra e um almoço do CLT, e uma compra do PJ sem matrícula."""
    agora = datetime.now(UTC)
    with FabricaDeSessao() as s:
        clt = s.get(Colaborador, dados["ativo"])
        pj = s.get(Colaborador, dados["inativo"])
        criados = []

        for pessoa, valor in ((clt, Decimal("101.10")), (pj, Decimal("33.00"))):
            pedido = Pedido(
                colaborador_id=pessoa.id,
                empresa_id=pessoa.empresa_id,
                vinculo=pessoa.vinculo,
                matricula=pessoa.matricula,
                valor_total=valor,
                status="entregue",
                codigo_retirada=f"T{uuid.uuid4().hex[:8]}",
            )
            s.add(pedido)
            criados.append(pedido)

        almoco = Almoco(
            colaborador_id=clt.id,
            empresa_id=clt.empresa_id,
            vinculo=clt.vinculo,
            matricula=clt.matricula,
            codigo_barras=uuid.uuid4().hex[:20],
            status="confirmado",
            origem="totem",
            valor=Decimal("18.50"),
            expira_em=agora,
            confirmado_em=agora,
        )
        s.add(almoco)
        s.commit()
        contexto = {
            "matricula": clt.matricula,
            "codparc_pj": pj.codparc,
            "codemp": s.get(Empresa, clt.empresa_id).codemp,
        }

    yield contexto

    with FabricaDeSessao() as s:
        s.execute(delete(Almoco).where(Almoco.colaborador_id.in_([dados["ativo"]])))
        s.execute(
            delete(Pedido).where(Pedido.colaborador_id.in_([dados["ativo"], dados["inativo"]]))
        )
        s.commit()


def _montar(competencia: str | None = None) -> folha.Folha:
    with FabricaDeSessao() as s:
        return folha.montar(s, ADMIN, competencia or consumo.competencia_atual())


def _minhas(dados_folha: folha.Folha, matricula: int) -> dict[int, folha.LinhaFolha]:
    """O banco de desenvolvimento tem movimento de outros testes; o arquivo é
    da empresa inteira. Filtrar pela própria matrícula é o que torna o teste
    independente de quem mais consumiu hoje."""
    return {linha.codevento: linha for linha in dados_folha.linhas if linha.codfunc == matricula}


def test_duas_linhas_por_pessoa_uma_por_evento(movimento):
    """Loja e refeitório são eventos diferentes na folha, então são linhas
    diferentes — somar os dois num valor só esconderia a separação que o
    holerite mostra."""
    minhas = _minhas(_montar(), movimento["matricula"])

    assert set(minhas) == {folha.CODEVENTO_LOJA, folha.CODEVENTO_REFEITORIO}
    assert minhas[folha.CODEVENTO_LOJA].valor == Decimal("101.10")
    assert minhas[folha.CODEVENTO_REFEITORIO].valor == Decimal("18.50")
    assert minhas[folha.CODEVENTO_LOJA].codemp == movimento["codemp"]


def test_sem_matricula_fica_fora_da_folha_mas_nao_some(movimento):
    """O PJ não tem CODFUNC e não pode entrar na importação. Se ele sumisse do
    resultado inteiro, o consumo dele nunca seria cobrado."""
    resultado = _montar()

    assert movimento["codparc_pj"] not in {linha.codfunc for linha in resultado.linhas}

    avulso = next(p for p in resultado.sem_matricula if p.codparc == movimento["codparc_pj"])
    assert avulso.total_loja == Decimal("33.00")
    assert avulso.total == Decimal("33.00")


def test_referencia_e_o_primeiro_dia_do_mes_que_fecha():
    """O ciclo 21/07 a 20/08 é a competência 2026-08 e referencia 01/08/2026."""
    assert folha._referencia("2026-08") == date(2026, 8, 1)
    assert folha._referencia("2026-01") == date(2026, 1, 1)


def test_planilha_tem_as_colunas_do_sankhya_na_ordem(movimento):
    aba = load_workbook(BytesIO(folha.planilha(_montar()))).active

    assert aba.title == "FOLHA"
    cabecalho = [celula.value for celula in aba[1]]
    assert cabecalho == [nome for nome, _formato, _largura in folha.COLUNAS]
    assert cabecalho == [
        "CODEMP",
        "CODFUNC",
        "REFERENCIA",
        "TIPMOV",
        "CODEVENTO",
        "SEQUENCIA",
        "INDICE",
        "VLRMOV",
        "TIPEVENTO",
        "UNIDADE",
    ]


def test_cada_celula_sai_com_o_tipo_que_o_sankhya_espera(movimento):
    """Número como texto é recusado na importação, e é o erro que não aparece
    na tela: a planilha abre bonita e a carga falha do outro lado."""
    aba = load_workbook(BytesIO(folha.planilha(_montar()))).active

    minha = next(
        fileira
        for fileira in aba.iter_rows(min_row=2)
        if fileira[1].value == movimento["matricula"]
        and fileira[4].value == folha.CODEVENTO_LOJA
    )
    (codemp, codfunc, referencia, tipmov, codevento,
     sequencia, indice, vlrmov, tipevento, unidade) = minha

    assert isinstance(codemp.value, int)
    assert isinstance(codfunc.value, int) and codfunc.value == movimento["matricula"]
    assert isinstance(referencia.value, datetime)
    assert isinstance(tipmov.value, str) and tipmov.value == "M"
    assert isinstance(codevento.value, int)
    assert isinstance(sequencia.value, int) and sequencia.value == 0
    assert isinstance(indice.value, (int, float, Decimal))
    assert isinstance(vlrmov.value, (int, float, Decimal)) and float(vlrmov.value) == 101.10
    assert isinstance(tipevento.value, int) and tipevento.value == -1
    assert isinstance(unidade.value, str) and unidade.value == "V"

    # O formato é o que o Excel e quem lê o arquivo usam para saber o tipo.
    assert referencia.number_format == folha.DATA
    assert vlrmov.number_format == folha.DECIMAL
    assert tipmov.number_format == folha.TEXTO
    assert codemp.number_format == folha.INTEIRO


def test_valor_zerado_nao_vira_linha(dados):
    """Um desconto de R$ 0,00 no holerite é ruído. Sem movimento, sem linha."""
    with FabricaDeSessao() as s:
        s.execute(delete(Pedido).where(Pedido.colaborador_id == dados["ativo"]))
        s.execute(delete(Almoco).where(Almoco.colaborador_id == dados["ativo"]))
        s.commit()
        matricula = s.get(Colaborador, dados["ativo"]).matricula

    assert _minhas(_montar(), matricula) == {}


def test_pedido_cancelado_e_almoco_expirado_nao_entram(dados, movimento):
    """A regra é a mesma do extrato que o colaborador vê. Se divergir, a pessoa
    confere o consumo na tela e encontra outro número no holerite."""
    with FabricaDeSessao() as s:
        s.execute(
            delete(Pedido).where(Pedido.colaborador_id == dados["ativo"])
        )
        almoco = Almoco(
            colaborador_id=dados["ativo"],
            empresa_id=dados["empresa"],
            vinculo="clt",
            matricula=movimento["matricula"],
            codigo_barras=uuid.uuid4().hex[:20],
            status="expirado",
            origem="totem",
            valor=Decimal("999.00"),
            expira_em=datetime.now(UTC),
        )
        s.add(almoco)
        s.commit()

    minhas = _minhas(_montar(), movimento["matricula"])
    assert set(minhas) == {folha.CODEVENTO_REFEITORIO}
    assert minhas[folha.CODEVENTO_REFEITORIO].valor == Decimal("18.50")


def test_dp_exporta_e_os_outros_nao(dados):
    """O DP fecha a folha; o refeitório e o colaborador comum, não.

    O refeitório precisa entrar aqui de propósito: ele vê o consumo de quem
    passa no balcão, o que faria parecer natural deixá-lo ver o de todos.
    """
    with FabricaDeSessao() as s:
        dp = Ator(id=dados["ativo"], codigo="x", nome="x", papel="dp")
        assert folha.montar(s, dp, consumo.competencia_atual()) is not None

        for papel in ("colaborador", "refeitorio"):
            ator = Ator(id=dados["ativo"], codigo="x", nome="x", papel=papel)
            with pytest.raises(SemPermissao):
                folha.montar(s, ator, consumo.competencia_atual())


def _entrar_como_admin(cliente, dados) -> None:
    with FabricaDeSessao() as s:
        pessoa = s.get(Colaborador, dados["ativo"])
        pessoa.senha_provisoria = False
        pessoa.papel = "admin"
        s.commit()
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})


def test_rota_entrega_o_arquivo_como_planilha(cliente, dados, movimento):
    """O navegador só baixa se o tipo e o nome vierem certos no cabeçalho."""
    _entrar_como_admin(cliente, dados)
    competencia = consumo.competencia_atual()

    resumo = cliente.get(f"/exportacoes/folha/resumo?competencia={competencia}")
    assert resumo.status_code == 200
    assert resumo.json()["referencia"] == folha._referencia(competencia).isoformat()
    assert resumo.json()["linhas"] >= 2

    arquivo = cliente.get(f"/exportacoes/folha?competencia={competencia}")
    assert arquivo.status_code == 200
    assert arquivo.headers["content-type"] == PLANILHA
    assert f'filename="folha-{competencia}.xlsx"' in arquivo.headers["content-disposition"]

    aba = load_workbook(BytesIO(arquivo.content)).active
    assert [celula.value for celula in aba[1]] == [nome for nome, _f, _l in folha.COLUNAS]


def test_competencia_invalida_nao_gera_arquivo(cliente, dados):
    _entrar_como_admin(cliente, dados)
    resposta = cliente.get("/exportacoes/folha?competencia=2026-13")
    assert resposta.status_code == 422
    assert resposta.json()["codigo"] == "competencia_invalida"
