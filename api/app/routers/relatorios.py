"""Relatórios administrativos que saem como planilha, não como JSON."""

from datetime import date

from fastapi import APIRouter, Response

from app.core.deps import AdminLiberado, Sessao
from app.modules import relatorio_vendas

rotas = APIRouter(prefix="/relatorios", tags=["relatórios"])

PLANILHA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@rotas.get("/vendas-por-empresa")
def vendas_por_empresa(de: date, ate: date, ator: AdminLiberado, sessao: Sessao) -> Response:
    """Só o que já foi entregue/confirmado. Duas abas: uma com o grupo, outra
    só com a empresa que precisa ficar separada."""
    linhas = relatorio_vendas.montar(sessao, ator, de, ate)
    conteudo = relatorio_vendas.planilha(linhas)
    return Response(
        content=conteudo,
        media_type=PLANILHA,
        headers={
            "content-disposition": f'attachment; filename="vendas-por-empresa-{de}_a_{ate}.xlsx"'
        },
    )
