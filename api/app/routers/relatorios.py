"""Relatórios administrativos que saem como planilha, não como JSON."""

from datetime import date

from fastapi import APIRouter, Response

from app.core.deps import AdminLiberado, Sessao
from app.modules import relatorio_vendas

rotas = APIRouter(prefix="/relatorios", tags=["relatórios"])

PLANILHA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@rotas.get("/vendas-detalhado")
def vendas_detalhado(de: date, ate: date, ator: AdminLiberado, sessao: Sessao) -> Response:
    """Uma linha por item comprado (ou almoço). Duas abas: o grupo, e a
    empresa que precisa ficar separada."""
    linhas = relatorio_vendas.montar(sessao, ator, de, ate)
    conteudo = relatorio_vendas.planilha_detalhada(sessao, linhas)
    return Response(
        content=conteudo,
        media_type=PLANILHA,
        headers={
            "content-disposition": f'attachment; filename="vendas-detalhado-{de}_a_{ate}.xlsx"'
        },
    )


@rotas.get("/vendas-consolidado")
def vendas_consolidado(de: date, ate: date, ator: AdminLiberado, sessao: Sessao) -> Response:
    """Uma linha por pessoa: total do período. Mesmas duas abas do detalhado."""
    linhas = relatorio_vendas.montar(sessao, ator, de, ate)
    consolidado = relatorio_vendas.consolidar_por_pessoa(linhas)
    conteudo = relatorio_vendas.planilha_consolidada(sessao, consolidado)
    return Response(
        content=conteudo,
        media_type=PLANILHA,
        headers={
            "content-disposition": f'attachment; filename="vendas-consolidado-{de}_a_{ate}.xlsx"'
        },
    )
