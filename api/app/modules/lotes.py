"""Lote de exportação: o que impede o mesmo ciclo entrar duas vezes no ERP.

Sem lote, a exportação é só um botão que gera arquivo — e nada distingue o
segundo download de uma segunda importação. O desconto dobra no holerite e
ninguém percebe até o fechamento contábil.

O lote resolve isso carimbando `lote_id` em cada pedido e almoço que entrou
nele. A partir daí o ciclo tem dono, o arquivo é reproduzível a partir do que
foi carimbado (e não recalculado por data), e fechar de novo é recusado pelo
banco, não por uma checagem que alguém pode esquecer de fazer.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.excecoes import (
    CicloAindaAberto,
    CompetenciaFechada,
    LoteNaoEncontrado,
    SemPermissao,
)
from app.models.exportacao import Exportacao
from app.models.operacao import Almoco, Pedido
from app.modules import auditoria, consumo, folha
from app.modules.auditoria import Ator


def _exigir_fechador(ator: Ator) -> None:
    """Quem exporta, fecha. É a mesma responsabilidade."""
    if ator.papel not in {"admin", "dp"}:
        raise SemPermissao()


def atual(sessao: Session, competencia: str) -> Exportacao | None:
    """O lote vivo da competência.

    Descartado não conta: é como se nunca tivesse existido, e é por isso que o
    índice único parcial ignora esse status — senão um lote descartado por
    engano travaria a competência para sempre.
    """
    return sessao.scalar(
        select(Exportacao).where(
            Exportacao.competencia == competencia,
            Exportacao.status != "descartada",
        )
    )


def fechar(sessao: Session, ator: Ator, competencia: str) -> Exportacao:
    """Fecha o ciclo e carimba tudo que entrou nele."""
    _exigir_fechador(ator)

    if atual(sessao, competencia) is not None:
        raise CompetenciaFechada()

    inicio, fim = consumo.intervalo_da_competencia(competencia)
    agora = datetime.now(UTC)
    if agora < fim:
        raise CicloAindaAberto()

    dados = folha.montar(sessao, ator, competencia)

    lote = Exportacao(
        competencia=competencia,
        status="exportada",
        criado_por=ator.id,
        fechado_em=agora,
        exportado_em=agora,
        total_registros=len(dados.linhas),
        valor_total=dados.total,
    )
    try:
        # O índice parcial é a autoridade contra dois fechamentos simultâneos.
        # O savepoint traduz a colisão sem inutilizar a transação externa.
        with sessao.begin_nested():
            sessao.add(lote)
            sessao.flush()
    except IntegrityError:
        raise CompetenciaFechada() from None

    # O mesmo recorte de `folha.montar`. Precisa ser o mesmo: o que for
    # carimbado é o que o arquivo vai mostrar daqui em diante.
    sessao.execute(
        update(Pedido)
        .where(
            Pedido.criado_em >= inicio,
            Pedido.criado_em < fim,
            Pedido.status != "cancelado",
            Pedido.lote_id.is_(None),
        )
        .values(lote_id=lote.id, exportado_em=agora)
    )
    sessao.execute(
        update(Almoco)
        .where(
            Almoco.criado_em >= inicio,
            Almoco.criado_em < fim,
            Almoco.status == "confirmado",
            Almoco.lote_id.is_(None),
        )
        .values(lote_id=lote.id, exportado_em=agora)
    )

    auditoria.registrar(
        sessao,
        ator,
        acao="exportacao.fechada",
        entidade="exportacao",
        entidade_id=lote.id,
        descricao=(
            f"Fechou a competência {competencia} com {lote.total_registros} "
            f"linha(s), total {lote.valor_total}."
        ),
        dados_novos={
            "competencia": competencia,
            "registros": lote.total_registros,
            "valor_total": str(lote.valor_total),
        },
    )
    return lote


def descartar(sessao: Session, ator: Ator, lote_id: uuid.UUID, motivo: str) -> Exportacao:
    """Desfaz um fechamento.

    Existe porque fechar é irreversível por construção, e a importação do outro
    lado pode falhar. Sem isto, um lote fechado por engano travaria a
    competência para sempre e a saída seria UPDATE na mão no banco.

    Descarrega o carimbo dos pedidos e almoços: eles voltam a ficar livres para
    o próximo fechamento da mesma competência.
    """
    _exigir_fechador(ator)

    lote = sessao.get(Exportacao, lote_id)
    if lote is None or lote.status == "descartada":
        raise LoteNaoEncontrado()

    sessao.execute(
        update(Pedido).where(Pedido.lote_id == lote.id).values(lote_id=None, exportado_em=None)
    )
    sessao.execute(
        update(Almoco).where(Almoco.lote_id == lote.id).values(lote_id=None, exportado_em=None)
    )

    anterior = lote.status
    lote.status = "descartada"

    auditoria.registrar(
        sessao,
        ator,
        acao="exportacao.descartada",
        entidade="exportacao",
        entidade_id=lote.id,
        descricao=f"Descartou o lote da competência {lote.competencia}: {motivo}",
        dados_anteriores={"status": anterior},
        dados_novos={"status": "descartada", "motivo": motivo},
    )
    return lote
