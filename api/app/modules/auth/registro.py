"""Registro de segurança do login: log de acesso e contadores de tentativa.

Tudo aqui usa SESSÃO PRÓPRIA e faz commit na hora, fora da transação da
requisição. Isso é deliberado e vale a explicação, porque contraria a regra
geral do projeto de commitar só na borda.

Quando o login falha, a requisição termina em erro e a transação dela é
desfeita. Se o log de tentativa e o contador vivessem nessa transação, seriam
desfeitos junto — ou seja, não sobraria rastro justamente das tentativas que
interessam, e o bloqueio após N erros nunca dispararia, porque o contador nunca
chegaria a incrementar.

A distinção é de natureza:

    log_auditoria  -> descreve uma MUDANÇA. Vive na transação dela.
    log_acesso     -> descreve uma TENTATIVA. Precisa sobreviver à falha dela.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert

from app.core import contexto
from app.core.config import obter_config
from app.core.db import FabricaDeSessao
from app.models.acesso import TentativaLogin
from app.models.auditoria import LogAcesso

_config = obter_config()

JANELA_IP_SEGUNDOS = 300
MAX_TENTATIVAS_POR_IP = 20

_SQL_CONTAR_IP = text(
    """
    insert into tentativas_ip as t (ip, tentativas, janela_inicio)
    values (:ip, 1, now())
    on conflict (ip) do update set
      tentativas = case
        when t.janela_inicio < now() - make_interval(secs => :janela) then 1
        else t.tentativas + 1 end,
      janela_inicio = case
        when t.janela_inicio < now() - make_interval(secs => :janela) then now()
        else t.janela_inicio end
    returning tentativas
    """
)

_SQL_LER_IP = text(
    """
    select tentativas from tentativas_ip
    where ip = :ip and janela_inicio > now() - make_interval(secs => :janela)
    """
)


def acesso(
    *,
    codigo: str,
    evento: str,
    motivo: str | None = None,
    usuario_id=None,
    usuario_nome: str | None = None,
) -> None:
    ctx = contexto.obter()
    with FabricaDeSessao() as s:
        s.add(
            LogAcesso(
                codigo=codigo,
                usuario_id=usuario_id,
                usuario_nome=usuario_nome,
                evento=evento,
                motivo=motivo,
                ip=ctx.ip,
                user_agent=ctx.user_agent,
                correlacao_id=ctx.correlacao_id,
            )
        )
        s.commit()


def ip_excedeu(ip: str | None) -> bool:
    if not ip:
        return False
    with FabricaDeSessao() as s:
        atual = s.execute(_SQL_LER_IP, {"ip": ip, "janela": JANELA_IP_SEGUNDOS}).scalar()
    return (atual or 0) >= MAX_TENTATIVAS_POR_IP


def contar_erro(codigo: str, ip: str | None) -> None:
    with FabricaDeSessao() as s:
        if ip:
            s.execute(_SQL_CONTAR_IP, {"ip": ip, "janela": JANELA_IP_SEGUNDOS})

        anterior = s.scalar(select(TentativaLogin).where(TentativaLogin.codigo == codigo))
        atuais = (anterior.tentativas if anterior else 0) + 1
        bloqueado_ate = (
            datetime.now(timezone.utc) + timedelta(minutes=_config.bloqueio_minutos)
            if atuais >= _config.max_tentativas
            else None
        )
        s.execute(
            insert(TentativaLogin)
            .values(codigo=codigo, tentativas=atuais, bloqueado_ate=bloqueado_ate)
            .on_conflict_do_update(
                index_elements=["codigo"],
                set_={"tentativas": atuais, "bloqueado_ate": bloqueado_ate},
            )
        )
        s.commit()


def limpar(codigo: str, ip: str | None) -> None:
    """Quem acertou a senha não é varredura: zera os dois contadores."""
    with FabricaDeSessao() as s:
        s.execute(
            insert(TentativaLogin)
            .values(codigo=codigo, tentativas=0, bloqueado_ate=None)
            .on_conflict_do_update(
                index_elements=["codigo"], set_={"tentativas": 0, "bloqueado_ate": None}
            )
        )
        if ip:
            s.execute(text("delete from tentativas_ip where ip = :ip"), {"ip": ip})
        s.commit()


def bloqueio_por_codigo_ativo(codigo: str) -> bool:
    with FabricaDeSessao() as s:
        bloqueado_ate = s.scalar(
            select(TentativaLogin.bloqueado_ate).where(TentativaLogin.codigo == codigo)
        )
    return bool(bloqueado_ate and bloqueado_ate > datetime.now(timezone.utc))
