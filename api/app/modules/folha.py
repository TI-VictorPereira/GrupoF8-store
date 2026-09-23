"""Exportação do consumo para a importação de eventos da folha do Sankhya.

Os nomes, a ordem e o TIPO de cada coluna não são escolha nossa: são o
contrato do ERP, que lê a tipagem da célula na importação. Um número gravado
como texto, ou uma data gravada como string, é recusado lá. Por isso o tipo
está declarado em `COLUNAS` e não deixado por conta do acaso.

Cada pessoa gera até duas linhas por competência — uma por evento — porque a
folha separa o que foi consumido na loja do que foi consumido no refeitório.
Quem não consumiu de um lado não gera a linha daquele lado.
"""

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.excecoes import SemPermissao
from app.models.cadastro import Colaborador, Empresa
from app.models.operacao import Almoco, Pedido
from app.modules import consumo
from app.modules.auditoria import Ator

# Eventos da folha. São dois porque o holerite mostra as duas coisas separadas.
CODEVENTO_LOJA = 10206  # CONSUMOS DIVERSOS
CODEVENTO_REFEITORIO = 10221  # CONSUMO REFEITORIO

# Constantes do layout: valem para toda linha, sempre.
TIPMOV = "M"
SEQUENCIA = 0
INDICE = Decimal("0.00")
TIPEVENTO = -1 
UNIDADE = "V"
TEXTO = "@"
INTEIRO = "0"
DECIMAL = "0.00"
DATA = "DD/MM/YYYY"

# (nome da coluna, formato, largura)
COLUNAS: tuple[tuple[str, str, int], ...] = (
    ("CODEMP", INTEIRO, 9),
    ("CODFUNC", INTEIRO, 10),
    ("REFERENCIA", DATA, 13),
    ("TIPMOV", TEXTO, 9),
    ("CODEVENTO", INTEIRO, 12),
    ("SEQUENCIA", INTEIRO, 12),
    ("INDICE", DECIMAL, 9),
    ("VLRMOV", DECIMAL, 12),
    ("TIPEVENTO", INTEIRO, 12),
    ("UNIDADE", TEXTO, 10),
)


@dataclass
class LinhaFolha:
    """Uma linha do arquivo. CODFUNC é a matrícula gravada no movimento."""

    codemp: int
    codfunc: int
    codevento: int
    valor: Decimal


@dataclass
class LinhaSemMatricula:
    """Quem consumiu e não cabe no arquivo da folha, por não ter matrícula.

    O PJ é proibido de ter matrícula por regra do cadastro, então ele nunca
    entra na importação de eventos. Sai numa planilha à parte para ser cobrado
    por fora — o consumo existe do mesmo jeito e não pode evaporar.
    """

    codemp: int
    codparc: int
    nome: str
    total_loja: Decimal
    total_refeitorio: Decimal

    @property
    def total(self) -> Decimal:
        return self.total_loja + self.total_refeitorio


@dataclass
class ConsumoDaPessoa:
    """O que uma pessoa consumiu no ciclo, antes de virar linha de arquivo.

    É desta lista que saem as três visões: as linhas da folha, quem ficou de
    fora por não ter matrícula, e a conferência que o DP usa para responder
    "por que descontaram isso de mim" sem abrir a planilha.
    """

    codemp: int
    codparc: int
    matricula: int | None
    nome: str
    codigo: str
    loja: Decimal
    refeitorio: Decimal

    @property
    def total(self) -> Decimal:
        return self.loja + self.refeitorio


@dataclass
class Folha:
    competencia: str
    referencia: date
    pessoas: list[ConsumoDaPessoa]

    @property
    def linhas(self) -> list[LinhaFolha]:
        """As linhas do arquivo. Valor zerado não vira linha: um desconto de
        R$ 0,00 no holerite é ruído."""
        linhas: list[LinhaFolha] = []
        for pessoa in self.pessoas:
            if pessoa.matricula is None:
                continue
            if pessoa.loja:
                linhas.append(
                    LinhaFolha(pessoa.codemp, pessoa.matricula, CODEVENTO_LOJA, pessoa.loja)
                )
            if pessoa.refeitorio:
                linhas.append(
                    LinhaFolha(
                        pessoa.codemp, pessoa.matricula, CODEVENTO_REFEITORIO, pessoa.refeitorio
                    )
                )
        return linhas

    @property
    def sem_matricula(self) -> list[LinhaSemMatricula]:
        return [
            LinhaSemMatricula(
                codemp=pessoa.codemp,
                codparc=pessoa.codparc,
                nome=pessoa.nome,
                total_loja=pessoa.loja,
                total_refeitorio=pessoa.refeitorio,
            )
            for pessoa in self.pessoas
            if pessoa.matricula is None
        ]

    @property
    def total(self) -> Decimal:
        return sum((linha.valor for linha in self.linhas), Decimal("0.00"))


def _referencia(competencia: str) -> date:
    """Primeiro dia do mês em que o ciclo fecha.

    A competência 2026-08 cobre de 21/07 a 20/08 e é referenciada na folha
    como 01/08/2026 — o mês, não o intervalo.
    """
    ano, mes = (int(parte) for parte in competencia.split("-"))
    return date(ano, mes, 1)

type _Chave = tuple[uuid.UUID, uuid.UUID, int | None]


def _somar(sessao: Session, modelo, coluna_valor, condicoes) -> dict[_Chave, Decimal]:
    linhas = sessao.execute(
        select(
            modelo.colaborador_id,
            modelo.empresa_id,
            modelo.matricula,
            func.sum(coluna_valor),
        )
        .where(*condicoes)
        .group_by(modelo.colaborador_id, modelo.empresa_id, modelo.matricula)
    ).all()
    return {(pessoa, empresa, matricula): valor for pessoa, empresa, matricula, valor in linhas}


def montar(
    sessao: Session, ator: Ator, competencia: str, lote_id: uuid.UUID | None = None
) -> Folha:
    """Consolida o ciclo em linhas de evento, uma por pessoa e por evento.

    As regras de quem conta são as mesmas do extrato que o colaborador vê:
    pedido não cancelado e almoço confirmado. Precisa ser a mesma, senão a
    pessoa confere o próprio consumo na tela e encontra outro número no
    holerite.
    """
    if ator.papel not in {"admin", "dp"}:
        raise SemPermissao()


    inicio, fim = consumo.intervalo_da_competencia(competencia)

    if lote_id is not None:
        
        onde_loja = [Pedido.lote_id == lote_id]
        onde_refeitorio = [Almoco.lote_id == lote_id]
    else:
        onde_loja = [
            Pedido.criado_em >= inicio,
            Pedido.criado_em < fim,
            Pedido.status != "cancelado",
        ]
        onde_refeitorio = [
            Almoco.criado_em >= inicio,
            Almoco.criado_em < fim,
            Almoco.status == "confirmado",
        ]

    loja = _somar(sessao, Pedido, Pedido.valor_total, onde_loja)
    refeitorio = _somar(sessao, Almoco, Almoco.valor, onde_refeitorio)

    chaves = set(loja) | set(refeitorio)
    codemp_de = dict(sessao.execute(select(Empresa.id, Empresa.codemp)).all())
    pessoas = {
        pessoa.id: pessoa
        for pessoa in sessao.scalars(
            select(Colaborador).where(Colaborador.id.in_({chave[0] for chave in chaves}))
        )
    }

    consolidado: list[ConsumoDaPessoa] = []
    for chave in chaves:
        colaborador_id, empresa_id, matricula = chave
        pessoa = pessoas[colaborador_id]
        consolidado.append(
            ConsumoDaPessoa(
                codemp=codemp_de[empresa_id],
                codparc=pessoa.codparc,
                matricula=matricula,
                nome=pessoa.nome_completo,
                codigo=pessoa.codigo,
                loja=loja.get(chave, Decimal("0.00")),
                refeitorio=refeitorio.get(chave, Decimal("0.00")),
            )
        )

    return Folha(
        competencia=competencia,
        referencia=_referencia(competencia),
        # Com matrícula primeiro e em ordem de CODFUNC: é assim que a folha lê,
        # e é a ordem em que o DP confere linha a linha contra o ERP.
        pessoas=sorted(
            consolidado, key=lambda p: (p.matricula is None, p.matricula or 0, p.nome)
        ),
    )


def _escrever(
    titulo: str, colunas: tuple[tuple[str, str, int], ...], fileiras: list[list]
) -> bytes:
    """Monta a planilha aplicando o formato declarado de cada coluna.

    O formato é aplicado célula a célula, e não à coluna inteira, porque é a
    célula que carrega o tipo para quem lê o arquivo depois.
    """
    livro = Workbook()
    aba: Worksheet = livro.active
    aba.title = titulo

    aba.append([nome for nome, _formato, _largura in colunas])
    for celula in aba[1]:
        celula.font = Font(bold=True)
    aba.freeze_panes = "A2"

    for fileira in fileiras:
        if len(fileira) != len(colunas):
            raise ValueError(f"linha com {len(fileira)} valores para {len(colunas)} colunas")
        aba.append(fileira)

    for indice, (_nome, formato, largura) in enumerate(colunas, start=1):
        aba.column_dimensions[aba.cell(row=1, column=indice).column_letter].width = largura
        for fileira_excel in range(2, aba.max_row + 1):
            aba.cell(row=fileira_excel, column=indice).number_format = formato

    buffer = BytesIO()
    livro.save(buffer)
    return buffer.getvalue()


def planilha(folha: Folha) -> bytes:
    """O arquivo que sobe no Sankhya. Uma aba só, nada além das colunas dele."""
    return _escrever(
        "FOLHA",
        COLUNAS,
        [
            [
                linha.codemp,
                linha.codfunc,
                folha.referencia,
                TIPMOV,
                linha.codevento,
                SEQUENCIA,
                INDICE,
                linha.valor,
                TIPEVENTO,
                UNIDADE,
            ]
            for linha in folha.linhas
        ],
    )


COLUNAS_SEM_MATRICULA: tuple[tuple[str, str, int], ...] = (
    ("CODEMP", INTEIRO, 9),
    ("CODPARC", INTEIRO, 10),
    ("NOME", TEXTO, 34),
    ("REFERENCIA", DATA, 13),
    ("CONSUMOS DIVERSOS", DECIMAL, 20),
    ("CONSUMO REFEITORIO", DECIMAL, 20),
    ("TOTAL", DECIMAL, 12),
)


def planilha_sem_matricula(folha: Folha) -> bytes:
    """Quem ficou de fora da folha. Layout nosso, não do Sankhya: este arquivo
    não é importado, é lido por gente para cobrar por outro caminho."""
    return _escrever(
        "SEM MATRICULA",
        COLUNAS_SEM_MATRICULA,
        [
            [
                linha.codemp,
                linha.codparc,
                linha.nome,
                folha.referencia,
                linha.total_loja,
                linha.total_refeitorio,
                linha.total,
            ]
            for linha in folha.sem_matricula
        ],
    )
