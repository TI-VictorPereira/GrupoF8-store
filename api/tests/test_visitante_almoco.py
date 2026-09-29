"""Almoço de visitante: cadastrado e liberado no totem, sem conferência depois."""

import uuid

import pytest
from sqlalchemy import delete, select

from app.core import contexto
from app.core.db import FabricaDeSessao
from app.excecoes import DepartamentoNaoEncontrado, NomeObrigatorio, SemPermissao, TermosNaoAceitos
from app.models.cadastro import Colaborador, Departamento
from app.models.operacao import Almoco
from app.modules import almocos
from app.modules.auditoria import Ator
from tests.conftest import CODIGO, SENHA


@pytest.fixture(autouse=True)
def _contexto_de_teste():
    contexto.definir(correlacao_id=uuid.uuid4(), ip=None, user_agent=None)


@pytest.fixture
def departamento():
    with FabricaDeSessao() as s:
        return s.scalar(select(Departamento.id))


@pytest.fixture
def _apagar_almocos_criados():
    """`dados`/`_limpar_operacoes` limpam por colaborador_id — o de visitante
    é nulo e não cai nesse filtro, por isso precisa da própria limpeza."""
    criados: list[uuid.UUID] = []
    yield criados
    if criados:
        with FabricaDeSessao() as s:
            s.execute(delete(Almoco).where(Almoco.id.in_(criados)))
            s.commit()


def _liberar_colaborador(dados, *, papel="colaborador"):
    with FabricaDeSessao() as s:
        colaborador = s.get(Colaborador, dados["ativo"])
        colaborador.senha_provisoria = False
        colaborador.papel = papel
        s.commit()


def _refeitorio(dados) -> Ator:
    return Ator(id=dados["ativo"], codigo=CODIGO, nome="Refeitório", papel="refeitorio")


def test_visitante_e_liberado_na_hora_sem_status_pendente(
    dados, departamento, _apagar_almocos_criados
):
    ator = _refeitorio(dados)
    with FabricaDeSessao() as s:
        almoco = almocos.registrar_visitante(s, ator, "Maria da Visita", departamento, True)
        s.commit()
        _apagar_almocos_criados.append(almoco.id)

    with FabricaDeSessao() as s:
        salvo = s.get(Almoco, almoco.id)
        assert salvo.colaborador_id is None
        assert salvo.empresa_id is None
        assert salvo.visitante_nome == "Maria da Visita"
        assert salvo.visitante_departamento_id == departamento
        assert salvo.origem == "visitante"
        assert salvo.status == "confirmado"
        assert salvo.confirmado_por == ator.id


def test_colaborador_comum_nao_registra_visitante(dados, departamento):
    comum = Ator(id=dados["ativo"], codigo=CODIGO, nome="x", papel="colaborador")
    with FabricaDeSessao() as s:
        with pytest.raises(SemPermissao):
            almocos.registrar_visitante(s, comum, "Alguém", departamento, True)


def test_visitante_precisa_aceitar_os_termos(dados, departamento):
    ator = _refeitorio(dados)
    with FabricaDeSessao() as s:
        with pytest.raises(TermosNaoAceitos):
            almocos.registrar_visitante(s, ator, "Alguém", departamento, False)


def test_visitante_precisa_de_nome(dados, departamento):
    ator = _refeitorio(dados)
    with FabricaDeSessao() as s:
        with pytest.raises(NomeObrigatorio):
            almocos.registrar_visitante(s, ator, "   ", departamento, True)


def test_visitante_precisa_de_departamento_existente(dados):
    ator = _refeitorio(dados)
    with FabricaDeSessao() as s:
        with pytest.raises(DepartamentoNaoEncontrado):
            almocos.registrar_visitante(s, ator, "Alguém", uuid.uuid4(), True)


def test_dois_visitantes_no_mesmo_dia_nao_colidem(dados, departamento, _apagar_almocos_criados):
    """O índice de 'um almoço por dia' é por colaborador — NULL nunca é igual
    a NULL num índice único, então visitante não esbarra nele."""
    ator = _refeitorio(dados)
    with FabricaDeSessao() as s:
        primeiro = almocos.registrar_visitante(s, ator, "Visitante Um", departamento, True)
        segundo = almocos.registrar_visitante(s, ator, "Visitante Dois", departamento, True)
        terceiro = almocos.registrar_visitante(s, ator, "Visitante Um", departamento, True)
        s.commit()
        _apagar_almocos_criados.extend([primeiro.id, segundo.id, terceiro.id])

    assert len({primeiro.id, segundo.id, terceiro.id}) == 3


def test_visitante_aparece_no_painel_com_o_nome_e_a_area(
    dados, departamento, _apagar_almocos_criados
):
    admin = Ator(id=dados["ativo"], codigo=CODIGO, nome="Admin", papel="admin")
    _liberar_colaborador(dados, papel="admin")

    with FabricaDeSessao() as s:
        nome_area = s.scalar(select(Departamento.nome).where(Departamento.id == departamento))
        almoco = almocos.registrar_visitante(s, admin, "Cliente Visitante", departamento, True)
        s.commit()
        _apagar_almocos_criados.append(almoco.id)

    with FabricaDeSessao() as s:
        linhas = almocos.listar_do_dia(s, admin)
        minha = next(linha for linha in linhas if linha.almoco.id == almoco.id)
        assert minha.eh_visitante is True
        assert minha.colaborador_nome == "Cliente Visitante"
        assert minha.departamento == nome_area


def test_rota_de_visitante_exige_papel_refeitorio_ou_admin(cliente, dados, departamento):
    _liberar_colaborador(dados, papel="colaborador")
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    resposta = cliente.post(
        "/almocos/visitante",
        json={
            "nome": "Fornecedor de Passagem",
            "departamento_id": str(departamento),
            "termos_aceitos": True,
        },
    )
    assert resposta.status_code == 403


def test_rota_de_visitante_libera_na_hora_quando_autorizado(
    cliente, dados, departamento, _apagar_almocos_criados
):
    _liberar_colaborador(dados, papel="refeitorio")
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    resposta = cliente.post(
        "/almocos/visitante",
        json={
            "nome": "Fornecedor de Passagem",
            "departamento_id": str(departamento),
            "termos_aceitos": True,
        },
    )
    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["visitante_nome"] == "Fornecedor de Passagem"
    assert corpo["colaborador_id"] is None
    assert corpo["status"] == "confirmado"
    _apagar_almocos_criados.append(uuid.UUID(corpo["id"]))
