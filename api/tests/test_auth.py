from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core import seguranca
from app.core.db import FabricaDeSessao
from app.models.auditoria import LogAcesso
from app.models.cadastro import Colaborador
from tests.conftest import CODIGO, CODIGO_FANTASMA, CODIGO_INATIVO, IP_TESTE, SENHA, eventos_de


def test_login_valido_devolve_usuario_e_cookies(cliente, dados):
    r = cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    assert r.status_code == 200
    corpo = r.json()
    assert corpo["codigo"] == CODIGO
    assert corpo["senha_provisoria"] is True
    assert corpo["empresa"]["nome"] == "Empresa de Teste"
    assert "f8_acesso" in r.cookies
    assert "f8_refresh" in r.cookies
    # hash e dados de ERP não podem vazar na resposta
    assert "senha_hash" not in corpo
    assert "codparc" not in corpo

    assert ("login_ok", None) in eventos_de(CODIGO)


def test_erro_traz_codigo_estavel_e_correlacao(cliente, dados):
    """O front decide pelo `codigo`, nunca pelo texto da mensagem."""
    r = cliente.post("/auth/login", json={"codigo": CODIGO, "senha": "errada"})
    corpo = r.json()

    assert r.status_code == 401
    assert corpo["codigo"] == "credenciais_invalidas"
    assert corpo["mensagem"]
    assert corpo["correlacao_id"] == r.headers["x-correlacao-id"]


def test_senha_errada_e_codigo_inexistente_dao_a_mesma_resposta(cliente, dados):
    a = cliente.post("/auth/login", json={"codigo": CODIGO, "senha": "errada"})
    b = cliente.post("/auth/login", json={"codigo": CODIGO_FANTASMA, "senha": "errada"})

    assert a.status_code == b.status_code == 401
    # Diferenciar aqui entregaria quais códigos existem.
    assert a.json()["codigo"] == b.json()["codigo"] == "credenciais_invalidas"
    assert a.json()["mensagem"] == b.json()["mensagem"]


def test_login_negado_fica_registrado_apesar_do_rollback(cliente, dados):
    """Este é o motivo de log_acesso e contadores viverem em transação própria.

    O 401 desfaz a transação da requisição. Se o registro estivesse nela,
    sumiria — e sem contador não existe bloqueio por tentativas.
    """
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": "errada"})
    cliente.post("/auth/login", json={"codigo": CODIGO_FANTASMA, "senha": "errada"})

    assert ("login_negado", "senha_invalida") in eventos_de(CODIGO)
    assert ("login_negado", "codigo_inexistente") in eventos_de(CODIGO_FANTASMA)


def test_bloqueia_por_codigo_apos_cinco_erros(cliente, dados):
    for _ in range(5):
        cliente.post("/auth/login", json={"codigo": CODIGO, "senha": "errada"})

    # senha certa agora, e ainda assim barra
    r = cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    assert r.status_code == 429
    assert r.json()["codigo"] == "acesso_bloqueado"
    assert ("bloqueado", "limite_por_codigo") in eventos_de(CODIGO)


def test_bloqueia_por_ip_varrendo_codigos_diferentes(cliente, dados):
    """O bloqueio por código protege UMA conta. Não impede varrer a faixa de
    códigos testando uma senha comum em cada um — quem impede é o limite por IP."""
    for i in range(20):
        cliente.post("/auth/login", json={"codigo": f"T-VARRE-{i}", "senha": "comum"})

    r = cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    assert r.status_code == 429
    assert r.json()["codigo"] == "acesso_bloqueado"
    assert ("bloqueado", "limite_por_ip") in eventos_de(CODIGO)


def test_usuario_inativo_nao_entra(cliente, dados):
    r = cliente.post("/auth/login", json={"codigo": CODIGO_INATIVO, "senha": SENHA})

    assert r.status_code == 401
    assert r.json()["codigo"] == "colaborador_inativo"
    assert ("login_negado", "inativo") in eventos_de(CODIGO_INATIVO)


def test_eu_exige_sessao(cliente, dados):
    sem_sessao = cliente.get("/auth/eu")
    assert sem_sessao.status_code == 401
    assert sem_sessao.json()["codigo"] == "nao_autenticado"

    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})
    r = cliente.get("/auth/eu")

    assert r.status_code == 200
    assert r.json()["codigo"] == CODIGO


def test_troca_de_senha_limpa_a_flag_de_provisoria(cliente, dados):
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    nova = "outra-senha-forte-456"
    resposta = cliente.post("/auth/senha", json={"senha_atual": SENHA, "senha_nova": nova})
    assert resposta.status_code == 200
    assert cliente.get("/auth/eu").json()["senha_provisoria"] is False

    cliente.post("/auth/logout")
    assert cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA}).status_code == 401
    assert cliente.post("/auth/login", json={"codigo": CODIGO, "senha": nova}).status_code == 200
    assert ("senha_trocada", None) in eventos_de(CODIGO)


def test_senha_nova_precisa_ser_diferente_e_ter_tamanho_minimo(cliente, dados):
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    curta = cliente.post("/auth/senha", json={"senha_atual": SENHA, "senha_nova": "abc"})
    igual = cliente.post("/auth/senha", json={"senha_atual": SENHA, "senha_nova": SENHA})
    errada = cliente.post("/auth/senha", json={"senha_atual": "nao-e", "senha_nova": "qualquer-1"})

    assert curta.json()["codigo"] == "senha_fraca"
    assert curta.json()["detalhes"]["minimo"] == 8
    assert igual.json()["codigo"] == "senha_repetida"
    assert errada.json()["codigo"] == "senha_atual_incorreta"


def test_troca_de_senha_derruba_os_outros_aparelhos(cliente, outro_cliente, dados):
    """O motivo do corte de sessão existir.

    Sem ele, resetar ou trocar a senha de alguém que já estava dentro não o
    expulsa — a sessão antiga seguiria válida por até 12h, que é exatamente o
    caso em que a troca costuma ser pedida.
    """
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})
    outro_cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})
    assert outro_cliente.get("/auth/eu").status_code == 200

    cliente.post("/auth/senha", json={"senha_atual": SENHA, "senha_nova": "senha-nova-forte-789"})

    # o aparelho que trocou continua dentro
    assert cliente.get("/auth/eu").status_code == 200
    # o outro cai na hora
    assert outro_cliente.get("/auth/eu").status_code == 401
    # e não volta pelo refresh
    assert outro_cliente.post("/auth/refresh").status_code == 401


def test_senha_temporaria_vencida_nao_entra(cliente, dados):
    """A senha está correta, mas passou da validade de 48h."""
    with FabricaDeSessao() as s:
        colaborador = s.get(Colaborador, dados["ativo"])
        colaborador.senha_provisoria = True
        colaborador.senha_provisoria_expira_em = datetime.now(timezone.utc) - timedelta(hours=1)
        s.commit()

    r = cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    assert r.status_code == 401
    assert r.json()["codigo"] == "senha_provisoria_expirada"
    assert ("login_negado", "provisoria_expirada") in eventos_de(CODIGO)


def test_senha_temporaria_dentro_do_prazo_entra(cliente, dados):
    with FabricaDeSessao() as s:
        colaborador = s.get(Colaborador, dados["ativo"])
        colaborador.senha_provisoria = True
        colaborador.senha_provisoria_expira_em = datetime.now(timezone.utc) + timedelta(hours=47)
        s.commit()

    r = cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    assert r.status_code == 200
    assert r.json()["senha_provisoria"] is True


def test_senha_temporaria_gerada_e_legivel_e_aleatoria():
    """Sem 0/O, 1/l/I — ela é ditada por telefone ou copiada de um papel."""
    amostras = {seguranca.gerar_senha_temporaria() for _ in range(200)}

    assert len(amostras) == 200  # sem repetição em 200 sorteios
    for senha in amostras:
        assert len(senha) == 9 and senha[4] == "-"
        assert not set(senha) & set("O0Il1S5Z2")


def test_logout_encerra_a_sessao(cliente, dados):
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})
    assert cliente.post("/auth/logout").status_code == 200

    assert cliente.get("/auth/eu").status_code == 401
    assert ("logout", None) in eventos_de(CODIGO)


def test_refresh_renova_a_sessao(cliente, dados):
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    assert cliente.post("/auth/refresh").status_code == 200
    assert cliente.get("/auth/eu").status_code == 200


def test_refresh_sem_cookie_recusa(cliente, dados):
    assert cliente.post("/auth/refresh").status_code == 401


def test_token_de_acesso_nao_serve_de_refresh(cliente, dados):
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})
    cliente.cookies.set("f8_refresh", cliente.cookies.get("f8_acesso"))

    assert cliente.post("/auth/refresh").status_code == 401


def test_corte_de_sessao_invalida_acesso_e_refresh(cliente, dados):
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    # Incrementar a versão basta: a comparação é exata e não depende de
    # relógio, então não há janela de um segundo para um token escapar.
    with FabricaDeSessao() as s:
        colaborador = s.get(Colaborador, dados["ativo"])
        colaborador.sessao_versao += 1
        s.commit()

    assert cliente.get("/auth/eu").status_code == 401
    assert cliente.post("/auth/refresh").status_code == 401


def test_senha_provisoria_expirada_recusa_login(cliente, dados):
    with FabricaDeSessao() as s:
        colaborador = s.get(Colaborador, dados["ativo"])
        colaborador.senha_provisoria_expira_em = seguranca.agora_em_segundos() - timedelta(
            seconds=1
        )
        s.commit()

    r = cliente.post("/auth/login", json={"codigo": CODIGO, "senha": SENHA})

    assert r.status_code == 401
    assert r.json()["codigo"] == "senha_provisoria_expirada"
    assert ("login_negado", "provisoria_expirada") in eventos_de(CODIGO)


def test_cabecalho_de_ip_forjado_nao_derruba_a_requisicao(cliente, dados):
    """X-Forwarded-For é preenchido pelo cliente. Como a coluna de auditoria é
    `inet`, texto arbitrário ali chegaria a virar erro 500 em todo login."""
    r = cliente.post(
        "/auth/login",
        json={"codigo": CODIGO, "senha": SENHA},
        headers={"x-forwarded-for": "nao-e-um-ip; drop table"},
    )

    assert r.status_code == 200


def test_ip_encaminhado_valido_e_registrado(cliente, dados):
    cliente.post("/auth/login", json={"codigo": CODIGO, "senha": "errada"})

    with FabricaDeSessao() as s:
        ips = s.scalars(select(LogAcesso.ip).where(LogAcesso.codigo == CODIGO)).all()

    # psycopg devolve IPv4Address, não texto — a coluna é `inet`.
    assert IP_TESTE in {str(ip) for ip in ips}


def test_entrada_invalida_devolve_campo_com_problema(cliente, dados):
    r = cliente.post("/auth/login", json={"codigo": ""})

    assert r.status_code == 422
    corpo = r.json()
    assert corpo["codigo"] == "dados_invalidos"
    campos = {c["campo"] for c in corpo["detalhes"]["campos"]}
    assert {"codigo", "senha"} & campos


def test_solicitar_senha_responde_igual_para_codigo_existente_ou_nao(cliente, dados):
    a = cliente.post("/auth/solicitar-senha", json={"codigo": CODIGO})
    b = cliente.post("/auth/solicitar-senha", json={"codigo": CODIGO_FANTASMA})

    assert a.status_code == b.status_code == 200
    assert a.json() == b.json()
    assert ("senha_solicitada", None) in eventos_de(CODIGO)
