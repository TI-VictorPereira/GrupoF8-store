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


class ConsumoDaPessoaSaida(BaseModel):
    """A conferência do DP: de onde veio cada valor, pessoa a pessoa.

    `codparc` vem sempre, mesmo quando `codfunc` existe: o PJ não tem matrícula,
    então sem CODFUNC a linha dele não entra na folha, e o codparc é o único
    código que identifica a pessoa na tela.
    """

    codemp: int
    codparc: int
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
    """O que a tela mostra antes de baixar: quantas linhas, quanto e se o ciclo
    já foi fechado. O PJ não entra no arquivo do Sankhya, então a quantidade e
    o total dele aparecem aqui, antes do download, para o consumo não sumir."""

    competencia: str
    referencia: date
    linhas: int
    total: Decimal
    pessoas: list[ConsumoDaPessoaSaida]
    quantidade_pj: int
    total_pj: Decimal
    quantidade_cortesias_isentos: int
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
        quantidade_pj=len(dados.sem_matricula),
        total_pj=sum((pessoa.total for pessoa in dados.sem_matricula), Decimal("0.00")),
        quantidade_cortesias_isentos=len(dados.cortesias_isentos),
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
def planilha_dos_pj(competencia: str, ator: DpOuAdminLiberado, sessao: Sessao) -> Response:
    """Consumo dos PJ, que não têm matrícula e por isso ficam fora do arquivo da folha."""
    return _arquivo(
        servico.planilha_sem_matricula(_montar(sessao, ator, competencia)),
        f"pj-{competencia}.xlsx",
    )


@rotas.get("/almocos-sem-desconto")
def planilha_dos_almocos_sem_desconto(
    competencia: str, ator: DpOuAdminLiberado, sessao: Sessao
) -> Response:
    """Isentos, cortesias e visitantes do ciclo: o que a empresa banca no refeitório."""
    return _arquivo(
        servico.planilha_almocos_sem_desconto(
            servico.almocos_sem_desconto(sessao, ator, competencia)
        ),
        f"almocos-isentos-cortesias-visitantes-{competencia}.xlsx",
    )


class DiaDeConsumoSaida(BaseModel):
    data: date
    almoco: Decimal
    loja: Decimal
    itens: str
    almoco_isento: Decimal


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
