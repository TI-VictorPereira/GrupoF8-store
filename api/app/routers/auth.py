"""Rotas de autenticação — camada fina sobre o módulo auth.

Nenhuma regra aqui: o router lê a entrada, chama o serviço, grava cookie e
devolve. Os erros sobem como exceção de `app.excecoes` e viram resposta nos
handlers.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Cookie, Response

from app.core import contexto, seguranca
from app.core.config import obter_config
from app.core.deps import COOKIE_ACESSO, COOKIE_REFRESH, AtorAtual, Sessao
from app.excecoes import NaoAutenticado
from app.models.cadastro import Colaborador, Empresa
from app.modules.auth import servico
from app.schemas.auth import (
    EmpresaResumo,
    EntradaLogin,
    EntradaSolicitacaoSenha,
    EntradaTrocaSenha,
    Eu,
    Mensagem,
)

_config = obter_config()

rotas = APIRouter(prefix="/auth", tags=["autenticação"])


def _gravar_cookie(resposta: Response, nome: str, valor: str, segundos: int) -> None:
    resposta.set_cookie(
        key=nome,
        value=valor,
        max_age=segundos,
        httponly=True,
        secure=_config.cookie_seguro,
        samesite="lax",
        path="/",
        domain=_config.cookie_dominio or None,
    )


def _gravar_sessao(resposta: Response, acesso: str, refresh: str) -> None:
    _gravar_cookie(resposta, COOKIE_ACESSO, acesso, _config.acesso_expira_minutos * 60)
    _gravar_cookie(resposta, COOKIE_REFRESH, refresh, _config.refresh_expira_horas * 3600)


def _montar_eu(sessao: Sessao, colaborador: Colaborador) -> Eu:
    empresa = sessao.get(Empresa, colaborador.empresa_id)
    return Eu(
        id=colaborador.id,
        nome_completo=colaborador.nome_completo,
        codigo=colaborador.codigo,
        papel=colaborador.papel,
        senha_provisoria=colaborador.senha_provisoria,
        empresa=EmpresaResumo.model_validate(empresa) if empresa else None,
    )


@rotas.post("/login", response_model=Eu)
def login(dados: EntradaLogin, resposta: Response, sessao: Sessao) -> Eu:
    # O IP vem do contexto, não de request.client: atrás do proxy o cliente é
    # sempre o Caddy, e o limite por IP viraria um limite global.
    emitida = servico.autenticar(sessao, dados.codigo, dados.senha, contexto.obter().ip)
    _gravar_sessao(resposta, emitida.token_acesso, emitida.token_refresh)
    return _montar_eu(sessao, emitida.colaborador)


@rotas.post("/refresh", response_model=Eu)
def renovar(
    resposta: Response,
    sessao: Sessao,
    f8_refresh: Annotated[str | None, Cookie(alias=COOKIE_REFRESH)] = None,
) -> Eu:
    """Renova os dois tokens. A sessão desliza, que é o que o totem precisa
    para não deslogar no meio do almoço."""
    if not f8_refresh:
        raise NaoAutenticado()

    dados = seguranca.ler_token(f8_refresh, "refresh")
    if not dados:
        raise NaoAutenticado()

    try:
        colaborador_id = uuid.UUID(dados["sub"])
    except (KeyError, ValueError):
        raise NaoAutenticado() from None

    colaborador = sessao.get(Colaborador, colaborador_id)
    if colaborador is None or not colaborador.ativo:
        raise NaoAutenticado()

    # Mesma checagem da dependência: o refresh não pode ser o buraco por onde
    # uma sessão cortada volta à vida.
    if seguranca.token_de_sessao_cortada(dados, colaborador.sessao_versao):
        raise NaoAutenticado()

    _gravar_sessao(
        resposta,
        seguranca.criar_token(colaborador.id, colaborador.papel, "acesso", colaborador.sessao_versao),
        seguranca.criar_token(colaborador.id, colaborador.papel, "refresh", colaborador.sessao_versao),
    )
    return _montar_eu(sessao, colaborador)


@rotas.get("/eu", response_model=Eu)
def eu(ator: AtorAtual, sessao: Sessao) -> Eu:
    colaborador = sessao.get(Colaborador, ator.id)
    if colaborador is None:
        raise NaoAutenticado()
    return _montar_eu(sessao, colaborador)


@rotas.post("/logout", response_model=Mensagem)
def logout(ator: AtorAtual, resposta: Response) -> Mensagem:
    servico.registrar_logout(ator)
    for nome in (COOKIE_ACESSO, COOKIE_REFRESH):
        resposta.delete_cookie(nome, path="/", domain=_config.cookie_dominio or None)
    return Mensagem(mensagem="Sessão encerrada.")


@rotas.post("/senha", response_model=Mensagem)
def trocar_senha(
    dados: EntradaTrocaSenha, ator: AtorAtual, resposta: Response, sessao: Sessao
) -> Mensagem:
    colaborador = servico.trocar_senha_propria(sessao, ator, dados.senha_atual, dados.senha_nova)
    # A troca moveu o corte de sessão e invalidou todos os tokens anteriores,
    # inclusive o desta aba. Emitir cookies novos mantém quem trocou logado e
    # derruba só os outros aparelhos.
    _gravar_sessao(
        resposta,
        seguranca.criar_token(colaborador.id, colaborador.papel, "acesso", colaborador.sessao_versao),
        seguranca.criar_token(colaborador.id, colaborador.papel, "refresh", colaborador.sessao_versao),
    )
    return Mensagem(mensagem="Senha alterada.")


@rotas.post("/solicitar-senha", response_model=Mensagem)
def solicitar_senha(dados: EntradaSolicitacaoSenha, sessao: Sessao) -> Mensagem:
    """Rota pública. A resposta é sempre a mesma, exista o código ou não —
    senão ela vira um oráculo de quais códigos existem."""
    servico.solicitar_nova_senha(sessao, dados.codigo, dados.nome_informado)
    return Mensagem(mensagem="Pedido registrado. Procure o administrador.")
