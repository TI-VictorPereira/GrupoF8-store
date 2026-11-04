"""O guia do DP só sai para DP e admin; o resto recebe um aviso, não o conteúdo."""

import pytest

from app.core.db import FabricaDeSessao
from app.models.cadastro import Colaborador
from tests.conftest import CODIGO, SENHA


def _entrar_como(cliente, dados, papel):
    with FabricaDeSessao() as s:
        pessoa = s.get(Colaborador, dados["ativo"])
        pessoa.papel = papel
        pessoa.senha_provisoria = False
        s.commit()
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})


def test_sem_login_nao_recebe_o_guia_do_dp(cliente):
    r = cliente.get("/ajuda/dp")

    assert r.status_code == 401
    assert "Sankhya" not in r.text
    assert cliente.get("/ajuda/dp/img/fechamento-sankhya.png").status_code == 401


@pytest.mark.parametrize("papel", ["colaborador", "entregador", "refeitorio"])
def test_outros_papeis_nao_recebem_o_guia_do_dp(cliente, dados, papel):
    _entrar_como(cliente, dados, papel)

    pagina = cliente.get("/ajuda/dp")
    imagem = cliente.get("/ajuda/dp/img/fechamento-sankhya.png")

    assert pagina.status_code == 403
    assert "Sankhya" not in pagina.text
    assert imagem.status_code == 403


@pytest.mark.parametrize("papel", ["dp", "admin"])
def test_dp_e_admin_recebem_o_guia_e_as_imagens(cliente, dados, papel):
    _entrar_como(cliente, dados, papel)

    pagina = cliente.get("/ajuda/dp")
    imagem = cliente.get("/ajuda/dp/img/fechamento-sankhya.png")

    assert pagina.status_code == 200
    assert "Guia do DP" in pagina.text
    assert pagina.headers["cache-control"] == "private, no-store"
    assert imagem.status_code == 200 and imagem.headers["content-type"] == "image/png"
    assert cliente.get("/ajuda/dp/img/../../config.png").status_code in (404, 422)
