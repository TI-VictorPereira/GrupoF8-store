"""Dependências do FastAPI: sessão, ator e guardas de papel."""

import uuid
from collections.abc import Callable
from typing import Annotated

from fastapi import Cookie, Depends
from sqlalchemy.orm import Session

from app.core import seguranca
from app.core.db import sessao as _sessao
from app.excecoes import NaoAutenticado, SemPermissao, SenhaProvisoriaPendente
from app.models.cadastro import Colaborador
from app.modules.auditoria import Ator

COOKIE_ACESSO = "f8_acesso"
COOKIE_REFRESH = "f8_refresh"

Sessao = Annotated[Session, Depends(_sessao)]


def obter_ator(
    sessao: Sessao,
    f8_acesso: Annotated[str | None, Cookie(alias=COOKIE_ACESSO)] = None,
) -> Ator:
    if not f8_acesso:
        raise NaoAutenticado()

    dados = seguranca.ler_token(f8_acesso, "acesso")
    if not dados:
        raise NaoAutenticado()

    try:
        colaborador_id = uuid.UUID(dados["sub"])
    except (KeyError, ValueError):
        raise NaoAutenticado() from None

    colaborador = sessao.get(Colaborador, colaborador_id)
    if colaborador is None or not colaborador.ativo:
        # Inativado depois do token emitido: o cadastro manda, não o token.
        raise NaoAutenticado()

    # Reset de senha e troca de senha movem o corte: tokens emitidos antes
    # param de valer na hora, em todos os aparelhos.
    if seguranca.token_de_sessao_cortada(dados, colaborador.sessao_versao):
        raise NaoAutenticado()

    return Ator(
        id=colaborador.id,
        codigo=colaborador.codigo,
        nome=colaborador.nome_completo,
        papel=colaborador.papel,
    )


AtorAtual = Annotated[Ator, Depends(obter_ator)]


def exige_papel(*papeis: str) -> Callable[[Ator], Ator]:
    """Nega por padrão: a rota só passa se o papel estiver na lista."""

    def verificar(ator: AtorAtual) -> Ator:
        if ator.papel not in papeis:
            raise SemPermissao(detalhes={"papeis_aceitos": list(papeis)})
        return ator

    return verificar


def exige_senha_definitiva(sessao: Sessao, ator: AtorAtual) -> Ator:
    """Barra quem ainda está com senha provisória.

    A tela do front também redireciona, mas quem garante é aqui — front é
    conveniência, não controle de acesso.
    """
    colaborador = sessao.get(Colaborador, ator.id)
    if colaborador is not None and colaborador.senha_provisoria:
        raise SenhaProvisoriaPendente()
    return ator


def exige_papel_com_senha_definitiva(*papeis: str) -> Callable[[Ator], Ator]:
    """Combina a troca obrigatória de senha com a autorização por papel."""

    def verificar(ator: Annotated[Ator, Depends(exige_senha_definitiva)]) -> Ator:
        if ator.papel not in papeis:
            raise SemPermissao(detalhes={"papeis_aceitos": list(papeis)})
        return ator

    return verificar


def exige_consumidor(ator: Annotated[Ator, Depends(exige_senha_definitiva)]) -> Ator:
    """Barra o posto do refeitório nas telas de quem consome.

    """
    if ator.papel == "refeitorio":
        raise SemPermissao(detalhes={"motivo": "posto do refeitório não consome"})
    return ator


ConsumidorLiberado = Annotated[Ator, Depends(exige_consumidor)]

SomenteAdmin = Annotated[Ator, Depends(exige_papel("admin"))]
AdminOuRefeitorio = Annotated[Ator, Depends(exige_papel("admin", "refeitorio"))]
AtorLiberado = Annotated[Ator, Depends(exige_senha_definitiva)]
AdminLiberado = Annotated[Ator, Depends(exige_papel_com_senha_definitiva("admin"))]
RefeitorioOuAdminLiberado = Annotated[
    Ator, Depends(exige_papel_com_senha_definitiva("admin", "refeitorio"))
]
# O DP fecha a folha: enxerga o consumo de todo mundo para exportar e conferir,
# e nada além disso. Estoque, preço, cadastro e entrega continuam só do admin.
DpOuAdminLiberado = Annotated[Ator, Depends(exige_papel_com_senha_definitiva("admin", "dp"))]
