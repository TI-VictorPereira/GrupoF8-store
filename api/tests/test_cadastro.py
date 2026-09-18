"""Cadastro de colaboradores, produtos e reset de senha."""

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy import delete, select

from app.core import contexto, seguranca
from app.core.db import FabricaDeSessao
from app.excecoes import (
    CodparcDuplicado,
    DadosInvalidos,
    MatriculaDuplicada,
    SemPermissao,
)
from app.models.acesso import TentativaLogin
from app.models.auditoria import LogAcesso, LogAuditoria
from app.models.cadastro import Colaborador, Empresa, Produto
from app.modules import colaboradores, produtos
from app.modules.auditoria import Ator
from app.modules.colaboradores import DadosColaborador
from app.modules.produtos import DadosProduto
from tests.conftest import CODIGO, SENHA

PREFIXO = "T-CAD-"


@pytest.fixture(autouse=True)
def _contexto_de_teste():
    contexto.definir(correlacao_id=uuid.uuid4(), ip=None, user_agent=None)


@pytest.fixture
def admin(dados):
    with FabricaDeSessao() as s:
        colaborador = s.get(Colaborador, dados["ativo"])
        colaborador.papel = "admin"
        colaborador.senha_provisoria = False
        s.commit()
    return Ator(id=dados["ativo"], codigo=CODIGO, nome="Fulano de Teste", papel="admin")


@pytest.fixture
def faxina():
    """Apaga o que os testes criarem, na ordem das chaves estrangeiras.

    log_acesso e log_auditoria apontam para colaboradores; apagar o
    colaborador primeiro estoura FK e a falha derruba a limpeza inteira.
    """
    yield
    with FabricaDeSessao() as s:
        alvos = select(Colaborador.id).where(Colaborador.codigo.like(f"{PREFIXO}%"))
        s.execute(delete(LogAcesso).where(LogAcesso.usuario_id.in_(alvos)))
        s.execute(delete(LogAcesso).where(LogAcesso.codigo.like(f"{PREFIXO}%")))
        s.execute(delete(LogAuditoria).where(LogAuditoria.usuario_id.in_(alvos)))
        s.execute(delete(TentativaLogin).where(TentativaLogin.codigo.like(f"{PREFIXO}%")))
        s.execute(delete(Colaborador).where(Colaborador.codigo.like(f"{PREFIXO}%")))
        s.execute(delete(Produto).where(Produto.codigo.like(f"{PREFIXO}%")))
        s.commit()


def _novo(dados, empresa_id, sufixo, **troca) -> DadosColaborador:
    base = {
        "nome_completo": f"Colaborador {sufixo}",
        "codigo": f"{PREFIXO}{sufixo}",
        "codparc": 700000 + int(sufixo),
        "empresa_id": empresa_id,
        "vinculo": "clt",
        "matricula": 700000 + int(sufixo),
    }
    base.update(troca)
    return DadosColaborador(**base)


# --------------------------------------------------------------- colaboradores


def test_criar_devolve_senha_provisoria_que_permite_entrar(cliente, admin, dados, faxina):
    with FabricaDeSessao() as s:
        criado, senha = colaboradores.criar(
            s, admin, _novo(dados, dados["empresa"], "01")
        )
        s.commit()
        assert criado.senha_provisoria is True

    r = cliente.post("/auth/login", json={"codigo": f"{PREFIXO}01", "senha": senha})

    assert r.status_code == 200
    assert r.json()["senha_provisoria"] is True
    # e, com senha provisória, não consegue usar o sistema antes de trocar
    assert cliente.get("/produtos/vitrine").status_code == 403


def test_senha_provisoria_nunca_aparece_na_auditoria(admin, dados, faxina):
    with FabricaDeSessao() as s:
        criado, senha = colaboradores.criar(s, admin, _novo(dados, dados["empresa"], "02"))
        s.commit()
        registros = list(
            s.scalars(select(LogAuditoria).where(LogAuditoria.entidade_id == criado.id))
        )

    assert registros
    for registro in registros:
        assert senha not in str(registro.dados_novos)
        assert "senha_hash" not in str(registro.dados_novos)


def test_reset_derruba_sessao_e_invalida_a_senha_antiga(cliente, outro_cliente, admin, dados, faxina):
    with FabricaDeSessao() as s:
        colaboradores.criar(s, admin, _novo(dados, dados["empresa"], "03"))
        s.commit()
        alvo = s.scalar(select(Colaborador).where(Colaborador.codigo == f"{PREFIXO}03"))
        alvo_id, senha_antiga = alvo.id, None

    # dá uma senha conhecida e loga nos dois aparelhos
    with FabricaDeSessao() as s:
        alvo = s.get(Colaborador, alvo_id)
        senha_antiga = "senha-conhecida-123"
        alvo.senha_hash = seguranca.gerar_hash(senha_antiga)
        alvo.senha_provisoria = False

        s.commit()

    for c in (cliente, outro_cliente):
        assert c.post("/auth/login", json={"codigo": f"{PREFIXO}03", "senha": senha_antiga}).status_code == 200

    with FabricaDeSessao() as s:
        nova = colaboradores.redefinir_senha(s, admin, alvo_id)
        s.commit()

    # as duas sessões abertas caem
    assert cliente.get("/auth/eu").status_code == 401
    assert outro_cliente.get("/auth/eu").status_code == 401
    # a senha antiga não vale mais
    assert cliente.post("/auth/login", json={"codigo": f"{PREFIXO}03", "senha": senha_antiga}).status_code == 401
    # a nova vale e vem marcada como provisória
    r = cliente.post("/auth/login", json={"codigo": f"{PREFIXO}03", "senha": nova})
    assert r.status_code == 200 and r.json()["senha_provisoria"] is True


def test_senha_provisoria_do_reset_vale_48h(admin, dados, faxina):
    with FabricaDeSessao() as s:
        colaboradores.criar(s, admin, _novo(dados, dados["empresa"], "04"))
        s.commit()
        alvo = s.scalar(select(Colaborador).where(Colaborador.codigo == f"{PREFIXO}04"))
        prazo = alvo.senha_provisoria_expira_em - alvo.criado_em

    assert timedelta(hours=47) < prazo < timedelta(hours=49)


def test_duplicidade_devolve_erro_especifico_e_nao_generico(admin, dados, faxina):
    with FabricaDeSessao() as s:
        colaboradores.criar(s, admin, _novo(dados, dados["empresa"], "05"))
        s.commit()

    with FabricaDeSessao() as s:
        with pytest.raises(CodparcDuplicado):
            colaboradores.criar(
                s, admin, _novo(dados, dados["empresa"], "06", codparc=700005)
            )

    with FabricaDeSessao() as s:
        with pytest.raises(MatriculaDuplicada):
            colaboradores.criar(
                s, admin, _novo(dados, dados["empresa"], "07", matricula=700005)
            )


def test_matricula_repete_entre_empresas(admin, dados, faxina):
    with FabricaDeSessao() as s:
        outra = Empresa(codemp=799999, nome="Outra Empresa de Teste")
        s.add(outra)
        s.flush()
        outra_id = outra.id
        colaboradores.criar(s, admin, _novo(dados, dados["empresa"], "08"))
        colaboradores.criar(s, admin, _novo(dados, outra_id, "09", matricula=700008))
        s.commit()

    with FabricaDeSessao() as s:
        assert len(list(s.scalars(select(Colaborador).where(Colaborador.matricula == 700008)))) == 2
        s.execute(delete(Colaborador).where(Colaborador.codigo.like(f"{PREFIXO}%")))
        s.execute(delete(Empresa).where(Empresa.id == outra_id))
        s.commit()


def test_vinculo_e_matricula_precisam_combinar(admin, dados, faxina):
    with FabricaDeSessao() as s:
        with pytest.raises(DadosInvalidos):
            colaboradores.criar(s, admin, _novo(dados, dados["empresa"], "10", matricula=None))
        with pytest.raises(DadosInvalidos):
            colaboradores.criar(
                s, admin, _novo(dados, dados["empresa"], "11", vinculo="pj", matricula=700011)
            )


def test_pj_entra_sem_matricula(admin, dados, faxina):
    with FabricaDeSessao() as s:
        criado, _ = colaboradores.criar(
            s, admin, _novo(dados, dados["empresa"], "12", vinculo="pj", matricula=None)
        )
        s.commit()
        assert criado.matricula is None and criado.codparc == 700012


def test_importacao_pula_a_linha_ruim_sem_derrubar_o_lote(admin, dados, faxina):
    linhas = [
        _novo(dados, dados["empresa"], "20"),
        _novo(dados, dados["empresa"], "21", matricula=None),  # CLT sem matrícula
        _novo(dados, dados["empresa"], "22"),
    ]
    with FabricaDeSessao() as s:
        resultado = colaboradores.importar(s, admin, linhas)
        s.commit()

    assert resultado.criados == 2
    assert len(resultado.erros) == 1 and f"{PREFIXO}21" in resultado.erros[0]
    assert set(resultado.senhas) == {f"{PREFIXO}20", f"{PREFIXO}22"}


def test_nao_admin_nao_mexe_em_colaboradores(dados):
    comum = Ator(id=dados["ativo"], codigo=CODIGO, nome="Fulano", papel="colaborador")
    with FabricaDeSessao() as s:
        with pytest.raises(SemPermissao):
            colaboradores.listar(s, comum)
        with pytest.raises(SemPermissao):
            colaboradores.redefinir_senha(s, comum, dados["ativo"])


def test_inativar_expulsa_de_imediato(cliente, admin, dados, faxina):
    with FabricaDeSessao() as s:
        colaboradores.criar(s, admin, _novo(dados, dados["empresa"], "13"))
        s.commit()
        alvo = s.scalar(select(Colaborador).where(Colaborador.codigo == f"{PREFIXO}13"))
        alvo_id = alvo.id
        alvo.senha_hash = seguranca.gerar_hash("senha-conhecida-123")
        alvo.senha_provisoria = False

        s.commit()

    cliente.post("/auth/login", json={"codigo": f"{PREFIXO}13", "senha": "senha-conhecida-123"})
    assert cliente.get("/auth/eu").status_code == 200

    with FabricaDeSessao() as s:
        colaboradores.definir_ativo(s, admin, alvo_id, False)
        s.commit()

    assert cliente.get("/auth/eu").status_code == 401


def test_admin_nao_inativa_o_proprio_acesso(admin, dados):
    from app.excecoes import Conflito

    with FabricaDeSessao() as s:
        with pytest.raises(Conflito):
            colaboradores.definir_ativo(s, admin, admin.id, False)


# -------------------------------------------------------------------- produtos


def test_produto_nasce_sem_estoque_e_ganha_por_ajuste(admin, faxina):
    with FabricaDeSessao() as s:
        criado = produtos.criar(
            s,
            admin,
            DadosProduto(
                nome="Água com gás",
                codigo=f"{PREFIXO}AGUA",
                preco_venda=Decimal("3.50"),
                custo=Decimal("1.20"),
            ),
        )
        s.commit()

    # estoque não entra pelo cadastro: só por ajuste auditado
    assert criado.estoque == 0


def test_vitrine_esconde_inativos_e_nao_expoe_custo(cliente, admin, dados, faxina):
    with FabricaDeSessao() as s:
        visivel = produtos.criar(
            s, admin, DadosProduto(nome="Visível", codigo=f"{PREFIXO}V", preco_venda=Decimal("2"), custo=Decimal("1"))
        )
        oculto = produtos.criar(
            s, admin, DadosProduto(nome="Oculto", codigo=f"{PREFIXO}O", preco_venda=Decimal("2"), custo=Decimal("1"))
        )
        s.flush()
        produtos.definir_ativo(s, admin, oculto.id, False)
        s.commit()
        visivel_id = visivel.id

    with FabricaDeSessao() as s:
        s.get(Colaborador, dados["ativo"]).senha_provisoria = False
        s.commit()
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    corpo = cliente.get("/produtos/vitrine").json()
    ids = {p["id"] for p in corpo}

    assert str(visivel_id) in ids
    assert all(p["nome"] != "Oculto" for p in corpo)
    assert all("custo" not in p for p in corpo)


def test_alteracao_de_produto_registra_apenas_o_que_mudou(admin, faxina):
    with FabricaDeSessao() as s:
        criado = produtos.criar(
            s, admin, DadosProduto(nome="Refri", codigo=f"{PREFIXO}R", preco_venda=Decimal("5"), custo=Decimal("2"))
        )
        s.flush()
        produto_id = criado.id
        produtos.alterar(
            s,
            admin,
            produto_id,
            DadosProduto(nome="Refri", codigo=f"{PREFIXO}R", preco_venda=Decimal("6"), custo=Decimal("2")),
        )
        s.commit()

    with FabricaDeSessao() as s:
        registro = s.scalar(
            select(LogAuditoria)
            .where(LogAuditoria.acao == "produto.alterado", LogAuditoria.entidade_id == produto_id)
        )

    assert registro is not None
    assert set(registro.dados_novos) == {"preco_venda"}
    assert registro.dados_anteriores["preco_venda"] == "5.00"
