"""Autenticação: login, troca de senha e pedido de nova senha.

Os serviços levantam exceção de `app.excecoes`. O log de acesso e os contadores
de tentativa não se perdem nesse rollback porque vivem em transação própria —
ver `registro.py`.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import seguranca
from app.core.config import obter_config
from app.excecoes import (
    AcessoBloqueado,
    ColaboradorInativo,
    CredenciaisInvalidas,
    SenhaAtualIncorreta,
    SenhaFraca,
    SenhaRepetida,
)
from app.models.acesso import SolicitacaoSenha
from app.models.cadastro import Colaborador
from app.modules.auditoria import Ator
from app.modules.auth import registro

_config = obter_config()


@dataclass
class SessaoEmitida:
    colaborador: Colaborador
    token_acesso: str
    token_refresh: str


def autenticar(sessao: Session, codigo: str, senha: str, ip: str | None) -> SessaoEmitida:
    codigo = (codigo or "").strip()

    if not codigo or not senha:
        raise CredenciaisInvalidas()

    if registro.ip_excedeu(ip):
        registro.acesso(codigo=codigo, evento="bloqueado", motivo="limite_por_ip")
        raise AcessoBloqueado()

    if registro.bloqueio_por_codigo_ativo(codigo):
        registro.acesso(codigo=codigo, evento="bloqueado", motivo="limite_por_codigo")
        raise AcessoBloqueado()

    colaborador = sessao.scalar(select(Colaborador).where(Colaborador.codigo == codigo))

    if colaborador is None:
        # Gasta o mesmo tempo de uma conferência real: resposta rápida denuncia
        # que o código não está cadastrado, e os códigos são fáceis de varrer.
        seguranca.gastar_tempo_de_conferencia()
        registro.contar_erro(codigo, ip)
        registro.acesso(codigo=codigo, evento="login_negado", motivo="codigo_inexistente")
        raise CredenciaisInvalidas()

    if not seguranca.conferir_senha(colaborador.senha_hash, senha):
        registro.contar_erro(codigo, ip)
        registro.acesso(
            codigo=codigo,
            evento="login_negado",
            motivo="senha_invalida",
            usuario_id=colaborador.id,
            usuario_nome=colaborador.nome_completo,
        )
        raise CredenciaisInvalidas()

    if not colaborador.ativo:
        registro.acesso(
            codigo=codigo,
            evento="login_negado",
            motivo="inativo",
            usuario_id=colaborador.id,
            usuario_nome=colaborador.nome_completo,
        )
        raise ColaboradorInativo()

    # A senha está correta, mas era temporária e passou da validade. Recusar
    # aqui, e não antes, mantém a resposta igual para quem só está chutando.
    if (
        colaborador.senha_provisoria
        and colaborador.senha_provisoria_expira_em
        and colaborador.senha_provisoria_expira_em <= datetime.now(timezone.utc)
    ):
        registro.acesso(
            codigo=codigo,
            evento="login_negado",
            motivo="provisoria_expirada",
            usuario_id=colaborador.id,
            usuario_nome=colaborador.nome_completo,
        )
        raise SenhaProvisoriaExpirada()

    # O custo recomendado do argon2 sobe com o tempo; rehash silencioso mantém
    # o hash atualizado sem pedir nada ao usuário.
    if seguranca.precisa_rehash(colaborador.senha_hash):
        colaborador.senha_hash = seguranca.gerar_hash(senha)

    registro.limpar(codigo, ip)
    registro.acesso(
        codigo=codigo,
        evento="login_ok",
        usuario_id=colaborador.id,
        usuario_nome=colaborador.nome_completo,
    )

    return SessaoEmitida(
        colaborador=colaborador,
        token_acesso=seguranca.criar_token(colaborador.id, colaborador.papel, "acesso"),
        token_refresh=seguranca.criar_token(colaborador.id, colaborador.papel, "refresh"),
    )


def registrar_logout(ator: Ator) -> None:
    registro.acesso(
        codigo=ator.codigo, evento="logout", usuario_id=ator.id, usuario_nome=ator.nome
    )


def trocar_senha_propria(sessao: Session, ator: Ator, senha_atual: str, senha_nova: str) -> None:
    colaborador = sessao.get(Colaborador, ator.id)
    if colaborador is None:
        raise CredenciaisInvalidas()

    if not seguranca.conferir_senha(colaborador.senha_hash, senha_atual):
        raise SenhaAtualIncorreta()

    if len(senha_nova) < _config.senha_tamanho_minimo:
        raise SenhaFraca(
            f"A senha precisa ter ao menos {_config.senha_tamanho_minimo} caracteres.",
            detalhes={"minimo": _config.senha_tamanho_minimo},
        )

    if seguranca.conferir_senha(colaborador.senha_hash, senha_nova):
        raise SenhaRepetida()

    colaborador.senha_hash = seguranca.gerar_hash(senha_nova)
    colaborador.senha_provisoria = False

    registro.acesso(
        codigo=ator.codigo, evento="senha_trocada", usuario_id=ator.id, usuario_nome=ator.nome
    )


def solicitar_nova_senha(sessao: Session, codigo: str, nome_informado: str | None) -> None:
    """Nunca levanta exceção: a resposta é a mesma exista o código ou não,
    senão a rota vira um oráculo de quais códigos existem."""
    codigo = (codigo or "").strip()
    if not codigo:
        return

    ja_aberta = sessao.scalar(
        select(SolicitacaoSenha.id).where(
            SolicitacaoSenha.codigo == codigo, SolicitacaoSenha.status == "aberta"
        )
    )
    if not ja_aberta:
        sessao.add(
            SolicitacaoSenha(codigo=codigo, nome_informado=(nome_informado or "").strip() or None)
        )

    registro.acesso(codigo=codigo, evento="senha_solicitada")


def carregar_colaborador(sessao: Session, colaborador_id: uuid.UUID) -> Colaborador | None:
    return sessao.get(Colaborador, colaborador_id)
