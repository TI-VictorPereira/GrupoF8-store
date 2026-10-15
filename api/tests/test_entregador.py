"""Entregador: colaborador que também atende o balcão, e nada além disso."""

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import delete

from app.core.config import obter_config
from app.core.db import FabricaDeSessao
from app.models.cadastro import Colaborador, Produto
from app.models.operacao import Pedido
from app.modules import pedidos
from app.modules.auditoria import Ator
from tests.conftest import CODIGO, CODIGO_INATIVO, SENHA

PREFIXO = "T-ENTREGA-"
NADA = str(uuid.UUID(int=0))
VENDA_INEXISTENTE = {
    "visitante_nome": f"{PREFIXO}Rota",
    "itens": [{"produto_id": NADA, "quantidade": 1}],
}

# Ids que não existem: a resposta é o erro de negócio, prova de que a guarda deixou passar.
LIBERADAS_AO_ENTREGADOR = [
    ("GET", "/pedidos/pendentes", None, 200),
    ("GET", "/pedidos/cancelados", None, 200),
    ("POST", f"/pedidos/{NADA}/entregar", None, 409),
    ("POST", f"/pedidos/{NADA}/cancelar", {"motivo": "Teste de rota"}, 409),
    ("POST", "/pedidos/visitante", VENDA_INEXISTENTE, 409),
    ("GET", "/pedidos/visitante?de=2026-01-01&ate=2026-01-01", None, 200),
    ("GET", "/pedidos/visitante/aguardando", None, 200),
    ("POST", f"/pedidos/{NADA}/confirmar-pix", None, 409),
    ("POST", "/almocos/manual", {"colaborador_id": NADA}, 404),
    ("POST", f"/almocos/{NADA}/desfazer", None, 404),
    ("GET", "/almocos/colaboradores?busca=Fulano", None, 200),
    ("GET", "/almocos/hoje", None, 200),
    ("POST", "/almocos/confirmar", {"codigo_barras": f"{PREFIXO}NADA"}, 400),
    (
        "POST",
        "/almocos/visitante",
        {"nome": "Visita", "departamento_id": NADA, "termos_aceitos": True},
        404,
    ),
    ("POST", f"/almocos/{NADA}/confirmar-pix", None, 404),
    ("GET", "/almocos/departamentos-visitante", None, 200),
    ("GET", "/almocos/preco-visitante", None, 200),
]

NEGADAS_AO_ENTREGADOR = [
    ("GET", "/colaboradores", None),
    (
        "POST",
        "/colaboradores",
        {
            "nome_completo": "Negado",
            "codigo": "T-NEGADO",
            "codparc": 1,
            "empresa_id": NADA,
            "vinculo": "pj",
        },
    ),
    ("GET", "/produtos", None),
    ("POST", "/produtos", {"nome": "Negado", "codigo": "T-NEGADO", "preco_venda": 1, "custo": 1}),
    ("POST", f"/estoque/{NADA}/ajustes", {"tipo": "entrada", "quantidade": 1, "motivo": "Teste"}),
    ("GET", "/relatorios/vendas-detalhado?de=2026-01-01&ate=2026-01-31", None),
    ("GET", "/pedidos?de=2026-01-01&ate=2026-01-31", None),
    ("GET", "/almocos?de=2026-01-01&ate=2026-01-31", None),
    ("PUT", "/almocos/preco", {"valor": 20}),
    ("GET", "/almocos/precos", None),
    ("GET", "/exportacoes/folha/resumo?competencia=2026-01", None),
    ("GET", "/consumo/competencias/empresa", None),
    ("GET", "/empresas", None),
    ("POST", "/departamentos", {"nome": "Negado"}),
]

SO_DO_BALCAO = [
    ("POST", "/almocos/manual", {"colaborador_id": NADA}),
    ("GET", "/almocos/hoje", None),
    ("GET", "/almocos/colaboradores?busca=Fulano", None),
    ("GET", "/pedidos/pendentes", None),
    ("GET", "/pedidos/visitante/aguardando", None),
    ("POST", "/pedidos/visitante", VENDA_INEXISTENTE),
]


@pytest.fixture
def produto(dados):
    with FabricaDeSessao() as s:
        item = Produto(
            nome="Café de teste",
            codigo=f"{PREFIXO}{dados['ativo'].hex[:8]}",
            custo=Decimal("2.00"),
            preco_venda=Decimal("5.00"),
            estoque=10,
        )
        s.add(item)
        s.commit()
        produto_id = item.id

    yield produto_id

    with FabricaDeSessao() as s:
        # Venda a visitante não tem colaborador: a limpeza do `dados` não a alcança.
        s.execute(delete(Pedido).where(Pedido.visitante_nome.like(f"{PREFIXO}%")))
        s.execute(delete(Produto).where(Produto.id == produto_id))
        s.commit()


@pytest.fixture
def _pix_configurado(monkeypatch):
    config = obter_config()
    monkeypatch.setattr(config, "pix_chave", "financeiro@exemplo.com.br")
    monkeypatch.setattr(config, "pix_recebedor", "Empresa Exemplo Ltda")
    monkeypatch.setattr(config, "pix_cidade", "Goiânia")


def _entrar(cliente, dados, papel: str) -> None:
    with FabricaDeSessao() as s:
        colaborador = s.get(Colaborador, dados["ativo"])
        colaborador.senha_provisoria = False
        colaborador.papel = papel
        s.commit()
    assert cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA}).status_code == 200


def _outro_consumidor(dados) -> Ator:
    """O "inativo" do conftest, reativado: o `dados` já apaga o que ele deixar."""
    with FabricaDeSessao() as s:
        s.get(Colaborador, dados["inativo"]).ativo = True
        s.commit()
    return Ator(
        id=dados["inativo"], codigo=CODIGO_INATIVO, nome="Beltrano Inativo", papel="colaborador"
    )


def _pedido_de_outro(dados, produto: uuid.UUID) -> str:
    outro = _outro_consumidor(dados)
    with FabricaDeSessao() as s:
        pedido = pedidos.finalizar(s, outro, [(produto, 1)])
        s.commit()
        return str(pedido.id)


def _compra(produto: uuid.UUID) -> dict:
    return {"itens": [{"produto_id": str(produto), "quantidade": 1}]}


@pytest.mark.parametrize("metodo, rota, corpo, status", LIBERADAS_AO_ENTREGADOR)
def test_entregador_passa_no_balcao_e_no_refeitorio(cliente, dados, metodo, rota, corpo, status):
    _entrar(cliente, dados, "entregador")

    resposta = cliente.request(metodo, rota, json=corpo)

    assert resposta.status_code == status, resposta.text


@pytest.mark.parametrize("metodo, rota, corpo", NEGADAS_AO_ENTREGADOR)
def test_entregador_nao_passa_do_balcao(cliente, dados, metodo, rota, corpo):
    _entrar(cliente, dados, "entregador")

    resposta = cliente.request(metodo, rota, json=corpo)

    assert resposta.status_code == 403
    assert resposta.json()["codigo"] == "sem_permissao"


@pytest.mark.parametrize("papel", ["refeitorio", "colaborador", "dp"])
@pytest.mark.parametrize("metodo, rota, corpo", SO_DO_BALCAO)
def test_balcao_continua_fechado_aos_outros_papeis(cliente, dados, papel, metodo, rota, corpo):
    _entrar(cliente, dados, papel)

    resposta = cliente.request(metodo, rota, json=corpo)

    assert resposta.status_code == 403
    assert resposta.json()["codigo"] == "sem_permissao"


def test_entregador_entrega_e_cancela_pedido_de_outro(cliente, dados, produto):
    a_entregar, a_cancelar = _pedido_de_outro(dados, produto), _pedido_de_outro(dados, produto)
    _entrar(cliente, dados, "entregador")

    # A fila é de todo mundo: acha o próprio pedido pelo id, não pela posição.
    fila = cliente.get("/pedidos/pendentes?por_pagina=200").json()["itens"]
    linha = next(linha for linha in fila if linha["pedido"]["id"] == a_entregar)
    assert linha["colaborador_codigo"] == CODIGO_INATIVO
    assert linha["pedido"]["itens"][0]["custo_unitario"] is None

    entregue = cliente.post(f"/pedidos/{a_entregar}/entregar").json()
    assert entregue["status"] == "entregue"
    assert entregue["entregue_por"] == str(dados["ativo"])

    cancelado = cliente.post(f"/pedidos/{a_cancelar}/cancelar", json={"motivo": "Desistiu"})
    assert cancelado.json()["status"] == "cancelado"
    linhas = cliente.get("/pedidos/cancelados?por_pagina=200").json()["itens"]
    minha = next(linha for linha in linhas if linha["pedido"]["id"] == a_cancelar)
    assert minha["cancelado_por_nome"] == "Fulano de Teste"
    assert minha["pedido"]["itens"][0]["custo_unitario"] is None


def test_entregador_vende_a_visitante_e_confirma_o_pix(
    cliente, dados, produto, _pix_configurado
):
    _entrar(cliente, dados, "entregador")
    antes = cliente.get("/pedidos/visitante/aguardando").json()["total"]

    def vender(nome: str) -> str:
        resposta = cliente.post(
            "/pedidos/visitante",
            json={
                "visitante_nome": f"{PREFIXO}{nome}",
                "itens": [{"produto_id": str(produto), "quantidade": 2}],
            },
        )
        assert resposta.status_code == 201, resposta.text
        assert resposta.json()["pix"]["valor"] == "10.00"
        assert resposta.json()["pedido"]["itens"][0]["custo_unitario"] is None
        return resposta.json()["pedido"]["id"]

    primeiro, segundo = vender("Primeiro"), vender("Segundo")

    fila = cliente.get("/pedidos/visitante/aguardando?por_pagina=200").json()
    assert fila["total"] == antes + 2
    ids = [pedido["id"] for pedido in fila["itens"]]
    assert ids.index(primeiro) < ids.index(segundo)
    itens = next(pedido for pedido in fila["itens"] if pedido["id"] == primeiro)["itens"]
    assert [(item["quantidade"], item["custo_unitario"]) for item in itens] == [(2, None)]
    assert len(cliente.get("/pedidos/visitante/aguardando?por_pagina=1").json()["itens"]) == 1

    assert cliente.post(f"/pedidos/{primeiro}/confirmar-pix").json()["status"] == "entregue"
    desistiu = cliente.post(f"/pedidos/{segundo}/cancelar", json={"motivo": "Desistiu"})
    assert desistiu.json()["status"] == "cancelado"
    assert cliente.get("/pedidos/visitante/aguardando").json()["total"] == antes


def test_entregador_confirma_almoco_de_outro_e_desfaz(cliente, dados):
    _outro_consumidor(dados)
    _entrar(cliente, dados, "entregador")
    achados = cliente.get("/almocos/colaboradores", params={"busca": "Beltrano"}).json()
    outro = next(pessoa["id"] for pessoa in achados if pessoa["codigo"] == CODIGO_INATIVO)

    almoco = cliente.post("/almocos/manual", json={"colaborador_id": outro}).json()
    assert almoco["status"] == "confirmado"
    assert cliente.post(f"/almocos/{almoco['id']}/desfazer").json()["status"] == "pendente"

    lido = cliente.post("/almocos/confirmar", json={"codigo_barras": almoco["codigo_barras"]})
    assert lido.json()["status"] == "confirmado"
    assert lido.json()["colaborador_nome"] == "Beltrano Inativo"


def test_entregador_continua_consumidor(cliente, dados, produto):
    _entrar(cliente, dados, "entregador")

    assert cliente.post("/pedidos", json=_compra(produto)).status_code == 201
    assert cliente.get("/pedidos/me").json()[0]["itens"][0]["custo_unitario"] is None
    assert cliente.post("/almocos/gerar").status_code == 201
    assert cliente.get("/consumo/me").status_code == 200


def test_custo_so_sai_para_o_admin(cliente, dados, produto):
    _entrar(cliente, dados, "admin")
    pedido_id = cliente.post("/pedidos", json=_compra(produto)).json()["id"]

    fila = cliente.get("/pedidos/pendentes?por_pagina=200").json()["itens"]
    linha = next(linha for linha in fila if linha["pedido"]["id"] == pedido_id)
    assert linha["pedido"]["itens"][0]["custo_unitario"] == "2.00"
    assert cliente.get("/pedidos/me").json()[0]["itens"][0]["custo_unitario"] == "2.00"

    _entrar(cliente, dados, "colaborador")
    assert cliente.get("/pedidos/me").json()[0]["itens"][0]["custo_unitario"] is None
