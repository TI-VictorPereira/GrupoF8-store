"""Exportação do ciclo para o Sankhya."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field

from app.core.deps import DpOuAdminLiberado, Sessao
from app.modules import folha as servico
from app.modules import lotes

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


class LoteSaida(BaseModel):
    """O fechamento do ciclo. Enquanto for `null`, nada foi exportado ainda."""

    id: uuid.UUID
    status: str
    fechado_em: datetime | None
    total_registros: int | None
    valor_total: Decimal | None


class ResumoSaida(BaseModel):
    """O que a tela mostra antes de baixar: quantas linhas, quanto, quem fica
    de fora e se o ciclo já foi fechado. A pessoa sem matrícula precisa
    aparecer ANTES do download, senão o consumo dela some sem ninguém
    perceber."""

    competencia: str
    referencia: date
    linhas: int
    total: Decimal
    pessoas: list[ConsumoDaPessoaSaida]
    sem_matricula: list[PessoaSemMatriculaSaida]
    total_sem_matricula: Decimal
    lote: LoteSaida | None


class EntradaFechamento(BaseModel):
    competencia: str = Field(min_length=7, max_length=7)


class EntradaDescarte(BaseModel):
    motivo: str = Field(min_length=3, max_length=300)


def _arquivo(conteudo: bytes, nome: str) -> Response:
    return Response(
        content=conteudo,
        media_type=PLANILHA,
        headers={"content-disposition": f'attachment; filename="{nome}"'},
    )


def _montar(sessao: Sessao, ator, competencia: str) -> servico.Folha:
    """Fechado sai do lote; aberto sai do cálculo por data.

    É o que faz o arquivo do ciclo fechado ser sempre o mesmo, mesmo que
    alguém cancele um pedido depois — o que já foi para o ERP não muda.
    """
    lote = lotes.atual(sessao, competencia)
    return servico.montar(sessao, ator, competencia, lote.id if lote else None)


@rotas.get("/folha/resumo", response_model=ResumoSaida)
def resumo(competencia: str, ator: DpOuAdminLiberado, sessao: Sessao) -> ResumoSaida:
    lote = lotes.atual(sessao, competencia)
    dados = servico.montar(sessao, ator, competencia, lote.id if lote else None)
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
        lote=LoteSaida.model_validate(lote, from_attributes=True) if lote else None,
    )


@rotas.post("/folha/fechar", response_model=LoteSaida, status_code=201)
def fechar(dados: EntradaFechamento, ator: DpOuAdminLiberado, sessao: Sessao) -> LoteSaida:
    """Fecha o ciclo e carimba o que entrou. Depois disto o arquivo não muda."""
    lote = lotes.fechar(sessao, ator, dados.competencia)
    return LoteSaida.model_validate(lote, from_attributes=True)


@rotas.post("/lotes/{lote_id}/descartar", response_model=LoteSaida)
def descartar(
    lote_id: uuid.UUID, dados: EntradaDescarte, ator: DpOuAdminLiberado, sessao: Sessao
) -> LoteSaida:
    """Desfaz o fechamento, para quando a importação no ERP falha."""
    lote = lotes.descartar(sessao, ator, lote_id, dados.motivo)
    return LoteSaida.model_validate(lote, from_attributes=True)


@rotas.get("/folha")
def planilha_da_folha(competencia: str, ator: DpOuAdminLiberado, sessao: Sessao) -> Response:
    """O arquivo de importação de eventos. Colunas e tipos são os do Sankhya."""
    return _arquivo(
        servico.planilha(_montar(sessao, ator, competencia)), f"folha-{competencia}.xlsx"
    )


@rotas.get("/sem-matricula")
def planilha_dos_sem_matricula(
    competencia: str, ator: DpOuAdminLiberado, sessao: Sessao
) -> Response:
    """Quem consumiu e não entra na folha por não ter matrícula."""
    return _arquivo(
        servico.planilha_sem_matricula(_montar(sessao, ator, competencia)),
        f"sem-matricula-{competencia}.xlsx",
    )
