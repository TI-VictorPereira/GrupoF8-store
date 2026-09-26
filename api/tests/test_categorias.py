"""Cadastro de categoria de produto: só o admin cria, sem nome repetido."""

import pytest
from sqlalchemy import delete, select

from app.core.db import FabricaDeSessao
from app.excecoes import CategoriaDuplicada, NomeObrigatorio, SemPermissao
from app.models.auditoria import LogAuditoria
from app.models.cadastro import CategoriaProduto, Colaborador
from app.modules import produtos
from app.modules.auditoria import Ator
from tests.conftest import CODIGO, SENHA

ADMIN = Ator(id=None, codigo="teste", nome="Admin de Teste", papel="admin")


@pytest.fixture(autouse=True)
def _limpar_categorias_de_teste():
    yield
    with FabricaDeSessao() as s:
        s.execute(delete(CategoriaProduto).where(CategoriaProduto.nome.like("Categoria de Teste%")))
        s.commit()


def test_admin_cria_categoria_e_fica_na_auditoria(dados):
    with FabricaDeSessao() as s:
        categoria = produtos.criar_categoria(s, ADMIN, "Categoria de Teste A")
        s.commit()
        categoria_id = categoria.id

    with FabricaDeSessao() as s:
        salva = s.get(CategoriaProduto, categoria_id)
        assert salva is not None
        assert salva.nome == "Categoria de Teste A"

        registro = s.scalar(
            select(LogAuditoria).where(
                LogAuditoria.entidade == "categoria_produto",
                LogAuditoria.entidade_id == categoria_id,
                LogAuditoria.acao == "categoria.criada",
            )
        )
        assert registro is not None


def test_nao_deixa_nome_repetido(dados):
    with FabricaDeSessao() as s:
        produtos.criar_categoria(s, ADMIN, "Categoria de Teste B")
        s.commit()

    with FabricaDeSessao() as s:
        with pytest.raises(CategoriaDuplicada):
            produtos.criar_categoria(s, ADMIN, "Categoria de Teste B")


def test_nome_em_branco_e_recusado(dados):
    with FabricaDeSessao() as s:
        with pytest.raises(NomeObrigatorio):
            produtos.criar_categoria(s, ADMIN, "   ")


def test_colaborador_comum_nao_cria_categoria(dados):
    comum = Ator(id=dados["ativo"], codigo=CODIGO, nome="x", papel="colaborador")
    with FabricaDeSessao() as s:
        with pytest.raises(SemPermissao):
            produtos.criar_categoria(s, comum, "Categoria de Teste C")


def test_rota_cria_e_lista_a_categoria_nova(cliente, dados):
    with FabricaDeSessao() as s:
        colaborador = s.get(Colaborador, dados["ativo"])
        colaborador.senha_provisoria = False
        colaborador.papel = "admin"
        s.commit()
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    criada = cliente.post("/produtos/categorias", json={"nome": "Categoria de Teste D"})
    assert criada.status_code == 201
    assert criada.json()["nome"] == "Categoria de Teste D"

    listadas = cliente.get("/produtos/categorias").json()
    assert "Categoria de Teste D" in {c["nome"] for c in listadas}

    repetida = cliente.post("/produtos/categorias", json={"nome": "Categoria de Teste D"})
    assert repetida.status_code == 409
    assert repetida.json()["codigo"] == "categoria_duplicada"
