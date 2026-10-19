"""Exportação do ciclo para o Sankhya."""

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from urllib.parse import quote
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field

from app.core.config import obter_config
from app.core.deps import DpOuAdminLiberado, Sessao
from app.excecoes import NadaParaAssinar
from app.modules import assinaturas, consumo, lotes
from app.modules import folha as servico

rotas = APIRouter(prefix="/exportacoes", tags=["exportações"])

PLANILHA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class PessoaSemMatriculaSaida(BaseModel):
    codemp: int
    codparc: int
    nome: str
    total: Decimal


class ConsumoDaPessoaSaida(BaseModel):
    """A conferência do DP: de onde veio cada valor, pessoa a pessoa.

    `codparc` vem sempre, mesmo quando `codfunc` existe — é o PJ que precisa
    dele: sem matrícula não há CODFUNC, e sem CODFUNC a linha nem entra na
    folha. Sem o codparc aqui, a tela diria só "sem matrícula" sem dizer qual
    é a pessoa por nenhum código, obrigando a abrir a lista separada de quem
    ficou de fora só para descobrir isso.
    """

    codemp: int
    codparc: int
    codfunc: int | None
    codigo: str
    nome: str
    loja: Decimal
    refeitorio: Decimal
    total: Decimal


class CortesiaIsentoSaida(BaseModel):
    tipo: str
    nome: str
    data: date
    valor: Decimal


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
    cortesias_isentos: list[CortesiaIsentoSaida]
    total_cortesias_isentos: Decimal
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
                codparc=pessoa.codparc,
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
        cortesias_isentos=[
            CortesiaIsentoSaida(
                tipo=linha.tipo, nome=linha.nome, data=linha.data, valor=linha.valor
            )
            for linha in dados.cortesias_isentos
        ],
        total_cortesias_isentos=dados.total_cortesias_isentos,
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


class DiaDeConsumoSaida(BaseModel):
    data: date
    almoco: Decimal
    loja: Decimal
    itens: str


class FolhaDeAssinaturaSaida(BaseModel):
    colaborador_id: uuid.UUID
    departamento_id: uuid.UUID | None
    nome: str
    codigo: str
    matricula: int | None
    empresa: str
    departamento: str | None
    dias: list[DiaDeConsumoSaida]
    total: Decimal


@rotas.get("/folha/assinaturas", response_model=list[FolhaDeAssinaturaSaida])
def folhas_de_assinatura(
    competencia: str, ator: DpOuAdminLiberado, sessao: Sessao
) -> list[FolhaDeAssinaturaSaida]:
    """Uma folha por pessoa, dia a dia, para imprimir e colher a assinatura."""
    return [
        FolhaDeAssinaturaSaida(
            colaborador_id=folha.colaborador_id,
            departamento_id=folha.departamento_id,
            nome=folha.nome,
            codigo=folha.codigo,
            matricula=folha.matricula,
            empresa=folha.empresa,
            departamento=folha.departamento,
            dias=[DiaDeConsumoSaida(**vars(dia)) for dia in folha.dias],
            total=folha.total,
        )
        for folha in servico.folhas_de_assinatura(sessao, ator, competencia)
    ]


@rotas.get("/folha/assinaturas/arquivo")
def arquivo_de_assinaturas(
    competencia: str,
    ator: DpOuAdminLiberado,
    sessao: Sessao,
    departamento_id: uuid.UUID | None = None,
    colaborador_id: uuid.UUID | None = None,
) -> Response:
    """Uma pessoa: o PDF dela. Uma área: zip com os PDFs. Sem filtro: zip
    "Grupo F8" com uma pasta por área."""
    folhas = servico.folhas_de_assinatura(
        sessao, ator, competencia, departamento_id=departamento_id, colaborador_id=colaborador_id
    )
    if not folhas:
        raise NadaParaAssinar()

    inicio, fim = consumo.intervalo_da_competencia(competencia, sessao)
    fuso = ZoneInfo(obter_config().fuso)
    de, ate = inicio.astimezone(fuso).date(), (fim - timedelta(seconds=1)).astimezone(fuso).date()

    if colaborador_id is not None:
        folha = folhas[0]
        conteudo, tipo = assinaturas.pdf(folha, competencia, de, ate), "application/pdf"
        nome = f"{assinaturas.nome_de_arquivo(folha.nome)}.pdf"
    elif departamento_id is not None:
        conteudo = assinaturas.zip_das_folhas(folhas, competencia, de, ate, por_area=False)
        area = folhas[0].departamento or assinaturas.SEM_DEPARTAMENTO
        tipo, nome = "application/zip", f"{assinaturas.nome_de_arquivo(area)}.zip"
    else:
        conteudo = assinaturas.zip_das_folhas(folhas, competencia, de, ate, por_area=True)
        tipo, nome = "application/zip", f"{assinaturas.GRUPO}.zip"

    return Response(
        content=conteudo,
        media_type=tipo,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(nome)}"},
    )
