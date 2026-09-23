"""Exportação do ciclo para o Sankhya."""

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Response
from pydantic import BaseModel

from app.core.deps import DpOuAdminLiberado, Sessao
from app.modules import folha as servico

rotas = APIRouter(prefix="/exportacoes", tags=["exportações"])

PLANILHA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class PessoaSemMatriculaSaida(BaseModel):
    codemp: int
    codparc: int
    nome: str
    total: Decimal


class ConsumoDaPessoaSaida(BaseModel):
    """A conferência do DP: de onde veio cada valor, pessoa a pessoa."""

    codemp: int
    codfunc: int | None
    codigo: str
    nome: str
    loja: Decimal
    refeitorio: Decimal
    total: Decimal


class ResumoSaida(BaseModel):
    """O que a tela mostra antes de baixar: quantas linhas, quanto, e quem fica
    de fora. A pessoa sem matrícula precisa aparecer ANTES do download, senão o
    consumo dela some sem ninguém perceber."""

    competencia: str
    referencia: date
    linhas: int
    total: Decimal
    pessoas: list[ConsumoDaPessoaSaida]
    sem_matricula: list[PessoaSemMatriculaSaida]
    total_sem_matricula: Decimal


def _arquivo(conteudo: bytes, nome: str) -> Response:
    return Response(
        content=conteudo,
        media_type=PLANILHA,
        headers={"content-disposition": f'attachment; filename="{nome}"'},
    )


@rotas.get("/folha/resumo", response_model=ResumoSaida)
def resumo(competencia: str, ator: DpOuAdminLiberado, sessao: Sessao) -> ResumoSaida:
    dados = servico.montar(sessao, ator, competencia)
    return ResumoSaida(
        competencia=dados.competencia,
        referencia=dados.referencia,
        linhas=len(dados.linhas),
        total=dados.total,
        pessoas=[
            ConsumoDaPessoaSaida(
                codemp=pessoa.codemp,
                codfunc=pessoa.matricula,
                codigo=pessoa.codigo,
                nome=pessoa.nome,
                loja=pessoa.loja,
                refeitorio=pessoa.refeitorio,
                total=pessoa.total,
            )
            for pessoa in dados.pessoas
        ],
        sem_matricula=[
            PessoaSemMatriculaSaida(
                codemp=pessoa.codemp,
                codparc=pessoa.codparc,
                nome=pessoa.nome,
                total=pessoa.total,
            )
            for pessoa in dados.sem_matricula
        ],
        total_sem_matricula=sum(
            (pessoa.total for pessoa in dados.sem_matricula), Decimal("0.00")
        ),
    )


@rotas.get("/folha")
def planilha_da_folha(competencia: str, ator: DpOuAdminLiberado, sessao: Sessao) -> Response:
    """O arquivo de importação de eventos. Colunas e tipos são os do Sankhya."""
    dados = servico.montar(sessao, ator, competencia)
    return _arquivo(servico.planilha(dados), f"folha-{competencia}.xlsx")


@rotas.get("/sem-matricula")
def planilha_dos_sem_matricula(
    competencia: str, ator: DpOuAdminLiberado, sessao: Sessao
) -> Response:
    """Quem consumiu e não entra na folha por não ter matrícula."""
    dados = servico.montar(sessao, ator, competencia)
    return _arquivo(servico.planilha_sem_matricula(dados), f"sem-matricula-{competencia}.xlsx")
