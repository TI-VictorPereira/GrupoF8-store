"""Fluxos críticos da fase 5: autorização, estoque, almoço e auditoria."""

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest
from sqlalchemy import delete, select

from app.core import contexto
from app.core.db import FabricaDeSessao
from app.models.auditoria import LogAuditoria
from app.models.cadastro import CategoriaProduto, Colaborador, Produto
from app.models.operacao import Almoco, ItemPedido, Pedido
from app.modules import almocos, pedidos
from app.modules.auditoria import Ator
from tests.conftest import CODIGO, SENHA


@pytest.fixture
def produto(dados):
    with FabricaDeSessao() as s:
        categoria = CategoriaProduto(nome="Teste Operações")
        s.add(categoria)
        s.flush()
        item = Produto(
            nome="Café de teste",
            # o UUID inteiro passa de varchar(40) por um caractere
            codigo=f"CAFE-{dados['ativo'].hex[:8]}",
            categoria_id=categoria.id,
            custo=Decimal("2.00"),
            preco_venda=Decimal("5.00"),
            estoque=10,
        )
        s.add(item)
        s.commit()
        ids = {"produto": item.id, "categoria": categoria.id}

    yield ids

    with FabricaDeSessao() as s:
        s.execute(delete(Produto).where(Produto.id == ids["produto"]))
        s.execute(delete(CategoriaProduto).where(CategoriaProduto.id == ids["categoria"]))
        s.commit()


@pytest.fixture(autouse=True)
def _limpar_operacoes(dados):
    yield
    with FabricaDeSessao() as s:
        pedido_ids = select(Pedido.id).where(Pedido.colaborador_id == dados["ativo"])
        s.execute(delete(ItemPedido).where(ItemPedido.pedido_id.in_(pedido_ids)))
        s.execute(delete(Pedido).where(Pedido.colaborador_id == dados["ativo"]))
        s.execute(delete(Almoco).where(Almoco.colaborador_id == dados["ativo"]))
        s.execute(delete(LogAuditoria).where(LogAuditoria.usuario_id == dados["ativo"]))
        s.commit()


def _liberar_colaborador(dados, *, papel="colaborador"):
    with FabricaDeSessao() as s:
        colaborador = s.get(Colaborador, dados["ativo"])
        colaborador.senha_provisoria = False
        colaborador.papel = papel
        s.commit()


def _ator(dados, *, papel="colaborador") -> Ator:
    return Ator(id=dados["ativo"], codigo=CODIGO, nome="Fulano de Teste", papel=papel)


def test_finalizar_pedido_baixa_estoque_e_mostra_apenas_o_proprio(cliente, dados, produto):
    _liberar_colaborador(dados)
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    r = cliente.post(
        "/pedidos",
        json={"itens": [{"produto_id": str(produto["produto"]), "quantidade": 3}]},
    )

    assert r.status_code == 201
    assert r.json()["valor_total"] == "15.00"
    assert len(cliente.get("/pedidos/me").json()) == 1
    with FabricaDeSessao() as s:
        assert s.get(Produto, produto["produto"]).estoque == 7


def test_refeitorio_nao_acessa_pendencias_administrativas(cliente, dados):
    _liberar_colaborador(dados, papel="refeitorio")
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    r = cliente.get("/pedidos/pendentes")

    assert r.status_code == 403
    assert r.json()["codigo"] == "sem_permissao"


def test_duas_compras_nao_deixam_estoque_negativo(dados, produto):
    """A condição no UPDATE, e não uma leitura prévia, decide a corrida."""
    with FabricaDeSessao() as s:
        s.get(Produto, produto["produto"]).estoque = 1
        s.commit()

    barreira = threading.Barrier(2)

    def comprar():
        with FabricaDeSessao() as s:
            barreira.wait()
            try:
                pedidos.finalizar(s, _ator(dados), [(produto["produto"], 1)])
                s.commit()
                return "ok"
            except Exception as erro:
                s.rollback()
                return type(erro).__name__

    with ThreadPoolExecutor(max_workers=2) as executador:
        resultados = list(executador.map(lambda _: comprar(), range(2)))

    assert resultados.count("ok") == 1
    with FabricaDeSessao() as s:
        assert s.get(Produto, produto["produto"]).estoque == 0


def test_gerar_almoco_simultaneo_cria_apenas_um(dados):
    ator = _ator(dados)
    barreira = threading.Barrier(2)

    def gerar():
        with FabricaDeSessao() as s:
            barreira.wait()
            almocos.gerar(s, ator)
            s.commit()

    with ThreadPoolExecutor(max_workers=2) as executador:
        list(executador.map(lambda _: gerar(), range(2)))

    with FabricaDeSessao() as s:
        assert s.scalar(select(Almoco).where(Almoco.colaborador_id == ator.id)) is not None
        assert len(list(s.scalars(select(Almoco).where(Almoco.colaborador_id == ator.id)))) == 1


def test_cancelamento_e_auditoria_caem_juntos_no_rollback(dados, produto):
    contexto.definir(correlacao_id=uuid.uuid4(), ip=None, user_agent=None)
    ator = _ator(dados, papel="admin")
    with FabricaDeSessao() as s:
        pedido = pedidos.finalizar(s, ator, [(produto["produto"], 1)])
        s.commit()
        pedido_id = pedido.id

    with FabricaDeSessao() as s:
        pedidos.cancelar(s, ator, pedido_id, "Teste de rollback")
        s.rollback()

    with FabricaDeSessao() as s:
        assert s.get(Pedido, pedido_id).status == "pendente"
        assert not list(
            s.scalars(
                select(LogAuditoria).where(
                    LogAuditoria.entidade == "pedido", LogAuditoria.entidade_id == pedido_id
                )
            )
        )


def test_colaborador_nao_busca_pessoas_para_lancamento(cliente, dados):
    _liberar_colaborador(dados)
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    r = cliente.get("/almocos/colaboradores", params={"busca": "Fulano"})

    assert r.status_code == 403
    assert r.json()["codigo"] == "sem_permissao"


def test_busca_do_painel_nao_expoe_cadastro(cliente, dados):
    """O refeitório precisa identificar a pessoa, não conhecer o cadastro dela.

    Se um dia alguém trocar esta rota pela listagem do admin, este teste cai —
    é o que impede codparc e matrícula de vazarem para o balcão.
    """
    _liberar_colaborador(dados, papel="refeitorio")
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    r = cliente.get("/almocos/colaboradores", params={"busca": "Fulano"})

    assert r.status_code == 200
    achado = r.json()[0]
    assert achado["nome_completo"] == "Fulano de Teste"
    assert set(achado) == {"id", "nome_completo", "codigo", "departamento"}


def test_busca_do_painel_ignora_termo_curto_e_inativo(cliente, dados):
    _liberar_colaborador(dados, papel="refeitorio")
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    assert cliente.get("/almocos/colaboradores", params={"busca": "F"}).json() == []
    # "Beltrano Inativo" existe no banco, mas está desativado
    assert cliente.get("/almocos/colaboradores", params={"busca": "Beltrano"}).json() == []


def test_desfazer_confirmacao_permite_confirmar_de_novo(cliente, dados):
    """Leitura por engano volta para pendente — a pessoa não fica sem almoço."""
    _liberar_colaborador(dados, papel="refeitorio")
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})
    codigo_barras = cliente.post("/almocos/gerar").json()["codigo_barras"]

    assert cliente.post("/almocos/confirmar", json={"codigo_barras": codigo_barras}).json()[
        "status"
    ] == "confirmado"
    repetido = cliente.post("/almocos/confirmar", json={"codigo_barras": codigo_barras})
    assert repetido.status_code == 409
    assert repetido.json()["codigo"] == "almoco_ja_confirmado"

    almoco_id = cliente.get("/almocos/hoje").json()[0]["almoco"]["id"]
    assert cliente.post(f"/almocos/{almoco_id}/desfazer").json()["status"] == "pendente"
    assert cliente.post("/almocos/confirmar", json={"codigo_barras": codigo_barras}).json()[
        "status"
    ] == "confirmado"
