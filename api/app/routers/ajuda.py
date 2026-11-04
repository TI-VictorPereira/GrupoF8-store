"""Guias de uso. O guia do colaborador é estático e público; o do DP só sai daqui,
para quem tem papel de DP ou admin. O texto dele não existe no site público."""

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Cookie, HTTPException, Response
from fastapi.responses import HTMLResponse

from app.core.deps import (
    COOKIE_ACESSO,
    DpOuAdminLiberado,
    Sessao,
    exige_senha_definitiva,
    obter_ator,
)
from app.excecoes import ErroDaAplicacao, SemPermissao

rotas = APIRouter(prefix="/ajuda", tags=["ajuda"], include_in_schema=False)

_PASTA = Path(__file__).resolve().parent.parent / "ajuda"
_IMAGENS = {"fechamento-sankhya", "fechamento-administrativo"}
# Guia de papel: nunca guardar em cache compartilhado, nem indexar.
_CABECALHOS = {"Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow"}

_AVISOS = {
    401: ("Entre no sistema", "Para abrir este guia, entre com o seu código e senha."),
    403: ("Guia restrito", "Este guia é só para o DP. O do colaborador está aberto a todos."),
}


def _pagina_de_aviso(status: int) -> HTMLResponse:
    titulo, texto = _AVISOS.get(status, _AVISOS[403])
    corpo = (
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<meta name="robots" content="noindex"><title>Loja Interna F8</title></head>'
        '<body style="margin:0;font:16px/1.5 system-ui,sans-serif;'
        'background:#fafaf7;color:#1a1a1a">'
        '<main style="max-width:420px;margin:0 auto;padding:64px 24px;text-align:center">'
        f'<h1 style="font-size:22px">{titulo}</h1><p style="color:#5b5b5b">{texto}</p>'
        '<p><a href="/" style="display:inline-block;min-height:44px;line-height:44px;'
        'padding:0 18px;border-radius:8px;background:#ffd600;color:#111;'
        'font-weight:700;text-decoration:none">Voltar ao sistema</a></p>'
        '</main></body></html>'
    )
    return HTMLResponse(corpo, status_code=status, headers=_CABECALHOS)


@rotas.get("/dp", response_class=HTMLResponse)
def guia_do_dp(
    sessao: Sessao, f8_acesso: Annotated[str | None, Cookie(alias=COOKIE_ACESSO)] = None
) -> Response:
    """É aberto por navegação direta, então erro vira uma página, não JSON."""
    try:
        ator = exige_senha_definitiva(sessao, obter_ator(sessao, f8_acesso))
        if ator.papel not in {"admin", "dp"}:
            raise SemPermissao()
    except ErroDaAplicacao as erro:
        return _pagina_de_aviso(401 if erro.status == 401 else 403)

    arquivo = _PASTA / "dp.html"
    if not arquivo.is_file():
        raise HTTPException(status_code=404, detail="Guia indisponível.")
    return HTMLResponse(arquivo.read_text(encoding="utf-8"), headers=_CABECALHOS)


@rotas.get("/dp/img/{nome}.png")
def imagem_do_guia_do_dp(nome: str, ator: DpOuAdminLiberado) -> Response:
    if nome not in _IMAGENS:
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")
    arquivo = _PASTA / "img" / f"{nome}.png"
    if not arquivo.is_file():
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")
    return Response(arquivo.read_bytes(), media_type="image/png", headers=_CABECALHOS)
