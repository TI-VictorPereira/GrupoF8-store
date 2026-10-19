"""Folhas de assinatura em PDF: uma por pessoa, para imprimir e colher a
assinatura do desconto. Preto no branco, porque sai impresso aos montes."""

import re
import zipfile
from collections import defaultdict
from datetime import date
from decimal import Decimal
from io import BytesIO

from fpdf import FPDF
from fpdf.fonts import FontFace

from app.modules.folha import FolhaDeAssinatura

GRUPO = "Grupo F8"
SEM_DEPARTAMENTO = "Sem departamento"


def _dinheiro(valor: Decimal) -> str:
    inteiro, centavos = f"{valor:.2f}".split(".")
    return f"R$ {int(inteiro):,}".replace(",", ".") + f",{centavos}"


def _data(dia: date) -> str:
    return dia.strftime("%d/%m/%Y")


def nome_de_arquivo(texto: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', " ", texto).strip() or "sem nome"


def pdf(folha: FolhaDeAssinatura, competencia: str, de: date, ate: date) -> bytes:
    ano, mes = competencia.split("-")
    documento = FPDF(format="A4")
    documento.set_margins(12, 12, 12)
    documento.set_auto_page_break(True, margin=12)
    documento.set_draw_color(0)
    documento.set_text_color(0)
    documento.add_page()

    documento.set_font("helvetica", "B", 14)
    documento.cell(text="Conferência de consumo", new_x="LMARGIN", new_y="NEXT")
    documento.set_font("helvetica", size=10)
    documento.cell(
        text=f"Ciclo {mes}/{ano}: de {_data(de)} a {_data(ate)}", new_x="LMARGIN", new_y="NEXT"
    )
    documento.ln(3)

    sem_fundo = FontFace(emphasis="BOLD", fill_color=None)
    with documento.table(col_widths=(2, 1, 1), first_row_as_headings=False) as tabela:
        linha = tabela.row()
        linha.cell(f"Nome: {folha.nome}")
        linha.cell(f"Código: {folha.codigo}")
        linha.cell(f"Matrícula: {folha.matricula or 'PJ'}")
        linha = tabela.row()
        linha.cell(f"Empresa: {folha.empresa}")
        linha.cell(f"Departamento: {folha.departamento or SEM_DEPARTAMENTO}", colspan=2)
    documento.ln(4)

    with documento.table(
        col_widths=(22, 22, 78, 22, 22),
        text_align=("LEFT", "RIGHT", "LEFT", "RIGHT", "RIGHT"),
        headings_style=sem_fundo,
    ) as tabela:
        cabecalho = tabela.row()
        for titulo in ("Data", "Almoço", "Loja", "Valor loja", "Total do dia"):
            cabecalho.cell(titulo)
        for dia in folha.dias:
            linha = tabela.row()
            linha.cell(_data(dia.data))
            linha.cell(_dinheiro(dia.almoco) if dia.almoco else "")
            linha.cell(dia.itens)
            linha.cell(_dinheiro(dia.loja) if dia.loja else "")
            linha.cell(_dinheiro(dia.almoco + dia.loja))
        linha = tabela.row()
        linha.cell("Total do ciclo", colspan=4, style=sem_fundo)
        linha.cell(_dinheiro(folha.total), style=sem_fundo)

    if documento.will_page_break(45):
        documento.add_page()
    documento.ln(8)
    documento.multi_cell(
        0,
        text=(
            "Declaro que conferi os lançamentos acima e autorizo o desconto de "
            f"{_dinheiro(folha.total)} em folha de pagamento."
        ),
        new_x="LMARGIN",
        new_y="NEXT",
    )
    documento.ln(20)
    y = documento.get_y()
    documento.line(12, y, 140, y)
    documento.line(150, y, 198, y)
    documento.set_xy(12, y + 1)
    documento.cell(128, text=folha.nome, align="C")
    documento.set_xy(150, y + 1)
    documento.cell(48, text="Data", align="C")
    return bytes(documento.output())


def _unico(nome: str, usados: set[str], codigo: str) -> str:
    candidato = f"{nome}.pdf"
    if candidato in usados:
        candidato = f"{nome} ({codigo}).pdf"
    usados.add(candidato)
    return candidato


def zip_das_folhas(
    folhas: list[FolhaDeAssinatura],
    competencia: str,
    de: date,
    ate: date,
    *,
    por_area: bool,
) -> bytes:
    """`por_area`: uma pasta por departamento dentro de "Grupo F8". Sem isso,
    os PDFs ficam soltos na raiz (é o lote de uma área só)."""
    memoria = BytesIO()
    usados: dict[str, set[str]] = defaultdict(set)
    with zipfile.ZipFile(memoria, "w", zipfile.ZIP_DEFLATED) as arquivo:
        for folha in folhas:
            pasta = (
                f"{GRUPO}/{nome_de_arquivo(folha.departamento or SEM_DEPARTAMENTO)}/"
                if por_area
                else ""
            )
            nome = _unico(nome_de_arquivo(folha.nome), usados[pasta], folha.codigo)
            arquivo.writestr(pasta + nome, pdf(folha, competencia, de, ate))
    return memoria.getvalue()
