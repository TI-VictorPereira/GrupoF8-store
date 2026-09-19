"""Fluxos de almoço: geração, confirmação por leitor e lançamento manual."""

import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import obter_config
from app.excecoes import (
    AlmocoExpirado,
    AlmocoJaConfirmado,
    AlmocoJaGeradoHoje,
    AlmocoNaoConfirmado,
    AlmocoNaoEncontrado,
    CodigoDeBarrasInvalido,
    ColaboradorNaoEncontrado,
    SemPermissao,
)
from app.models.cadastro import Colaborador, Departamento, PrecoAlmoco
from app.models.operacao import Almoco
from app.modules import auditoria
from app.modules.auditoria import Ator

_config = obter_config()


def _agora() -> datetime:
    return datetime.now(UTC)


def _limites_do_dia(agora: datetime) -> tuple[datetime, datetime]:
    local = agora.astimezone(ZoneInfo(_config.fuso))
    inicio_local = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return inicio_local.astimezone(UTC), (inicio_local + timedelta(days=1)).astimezone(UTC)


def _almoco_hoje(sessao: Session, colaborador_id: uuid.UUID, agora: datetime) -> Almoco | None:
    inicio, fim = _limites_do_dia(agora)
    return sessao.scalar(
        select(Almoco)
        .where(
            Almoco.colaborador_id == colaborador_id,
            Almoco.criado_em >= inicio,
            Almoco.criado_em < fim,
            Almoco.status.in_(("pendente", "confirmado")),
        )
        .order_by(Almoco.criado_em.desc())
    )


def _preco_vigente(sessao: Session, agora: datetime) -> Decimal:
    hoje = agora.astimezone(ZoneInfo(_config.fuso)).date()
    preco = sessao.scalar(
        select(PrecoAlmoco)
        .where(
            PrecoAlmoco.vigencia_inicio <= hoje,
            (PrecoAlmoco.vigencia_fim.is_(None)) | (PrecoAlmoco.vigencia_fim >= hoje),
        )
        .order_by(PrecoAlmoco.vigencia_inicio.desc())
    )
    return preco.valor if preco else Decimal("0")


def _codigo_barras() -> str:
    """14 dígitos aleatórios.
    """
    return f"{secrets.randbelow(10**14):014d}"


def gerar(sessao: Session, ator: Ator) -> Almoco:
    agora = _agora()
    existente = _almoco_hoje(sessao, ator.id, agora)
    if existente is not None:
        # Um código pendente que passou da validade continua com status
        # 'pendente' — nada o expira sozinho. Sem marcar aqui, o colaborador
        # receberia de volta o código morto e ficaria sem almoço o resto do
        # dia, porque o índice parcial impede gerar outro.
        if existente.status == "pendente" and existente.expira_em <= agora:
            existente.status = "expirado"
            sessao.flush()
        else:
            return existente

    colaborador = sessao.get(Colaborador, ator.id)
    if colaborador is None or not colaborador.ativo:
        raise ColaboradorNaoEncontrado()

    almoco = Almoco(
        colaborador_id=colaborador.id,
        empresa_id=colaborador.empresa_id,
        vinculo=colaborador.vinculo,
        matricula=colaborador.matricula,
        codigo_barras=_codigo_barras(),
        status="pendente",
        origem="totem",
        valor=_preco_vigente(sessao, agora),
        expira_em=agora + timedelta(minutes=_config.almoco_validade_minutos),
    )
    try:
        # O índice parcial é a autoridade contra duas requisições simultâneas.
        # Savepoint permite traduzir a colisão sem inutilizar a transação externa.
        with sessao.begin_nested():
            sessao.add(almoco)
            sessao.flush()
    except IntegrityError:
        existente = _almoco_hoje(sessao, ator.id, agora)
        if existente is not None:
            return existente
        raise
    return almoco


def confirmar(sessao: Session, ator: Ator, codigo_barras: str) -> Almoco:
    if ator.papel not in {"admin", "refeitorio"}:
        raise SemPermissao()
    agora = _agora()
    almoco = sessao.execute(
        update(Almoco)
        .where(
            Almoco.codigo_barras == codigo_barras,
            Almoco.status == "pendente",
            Almoco.expira_em > agora,
        )
        .values(status="confirmado", confirmado_em=agora, confirmado_por=ator.id)
        .returning(Almoco)
    ).scalar_one_or_none()
    if almoco is not None:
        return almoco

    existente = sessao.scalar(select(Almoco).where(Almoco.codigo_barras == codigo_barras))
    if existente is None:
        raise CodigoDeBarrasInvalido()
    if existente.status == "confirmado":
        raise AlmocoJaConfirmado()
    if existente.expira_em <= agora:
        raise AlmocoExpirado()
    raise CodigoDeBarrasInvalido()


@dataclass
class LinhaPainel:
    almoco: Almoco
    colaborador_nome: str
    colaborador_codigo: str
    departamento: str | None


def meu_de_hoje(sessao: Session, ator: Ator) -> Almoco | None:
    """O que o colaborador vê na tela do almoço. Não cria nada."""
    return _almoco_hoje(sessao, ator.id, _agora())


def listar_do_dia(sessao: Session, ator: Ator, status: str | None = None) -> list[LinhaPainel]:
    if ator.papel not in {"admin", "refeitorio"}:
        raise SemPermissao()

    inicio, fim = _limites_do_dia(_agora())
    consulta = (
        select(Almoco, Colaborador.nome_completo, Colaborador.codigo, Departamento.nome)
        .join(Colaborador, Colaborador.id == Almoco.colaborador_id)
        .outerjoin(Departamento, Departamento.id == Colaborador.departamento_id)
        .where(Almoco.criado_em >= inicio, Almoco.criado_em < fim)
        .order_by(Almoco.criado_em.desc())
    )
    if status:
        consulta = consulta.where(Almoco.status == status)

    return [
        LinhaPainel(almoco=a, colaborador_nome=nome, colaborador_codigo=codigo, departamento=dep)
        for a, nome, codigo, dep in sessao.execute(consulta).all()
    ]


def desfazer_confirmacao(sessao: Session, ator: Ator, almoco_id: uuid.UUID) -> Almoco:
    """Corrige uma leitura feita por engano no totem.

    Volta para 'pendente' em vez de cancelar, para o colaborador poder ser
    confirmado de novo no mesmo dia — o índice parcial aceita, porque continua
    existindo um único almoço ativo.
    """
    if ator.papel not in {"admin", "refeitorio"}:
        raise SemPermissao()

    almoco = sessao.get(Almoco, almoco_id)
    if almoco is None:
        raise AlmocoNaoEncontrado()
    if almoco.status != "confirmado":
        raise AlmocoNaoConfirmado()

    almoco.status = "pendente"
    almoco.confirmado_em = None
    almoco.confirmado_por = None

    auditoria.registrar(
        sessao,
        ator,
        acao="almoco.confirmacao_desfeita",
        entidade="almoco",
        entidade_id=almoco.id,
        descricao=f"Desfez a confirmação do almoço {almoco.codigo_barras[-6:]}.",
        dados_anteriores={"status": "confirmado"},
        dados_novos={"status": "pendente"},
    )
    return almoco


def registrar_manual(sessao: Session, ator: Ator, colaborador_id: uuid.UUID) -> Almoco:
    if ator.papel not in {"admin", "refeitorio"}:
        raise SemPermissao()
    agora = _agora()
    colaborador = sessao.get(Colaborador, colaborador_id)
    if colaborador is None or not colaborador.ativo:
        raise ColaboradorNaoEncontrado()

    existente = _almoco_hoje(sessao, colaborador_id, agora)
    if existente is not None:
        if existente.status == "confirmado":
            raise AlmocoJaConfirmado()
        existente.status = "confirmado"
        existente.confirmado_em = agora
        existente.confirmado_por = ator.id
        auditoria.registrar(
            sessao,
            ator,
            acao="almoco.confirmado_manual",
            entidade="almoco",
            entidade_id=existente.id,
            descricao=f"Confirmou manualmente o almoço de {colaborador.nome_completo}.",
            dados_anteriores={"status": "pendente", "origem": existente.origem},
            dados_novos={"status": "confirmado", "origem": "manual"},
        )
        return existente

    almoco = Almoco(
        colaborador_id=colaborador.id,
        empresa_id=colaborador.empresa_id,
        vinculo=colaborador.vinculo,
        matricula=colaborador.matricula,
        codigo_barras=_codigo_barras(),
        status="confirmado",
        origem="manual",
        valor=_preco_vigente(sessao, agora),
        expira_em=agora + timedelta(minutes=_config.almoco_validade_minutos),
        confirmado_em=agora,
        confirmado_por=ator.id,
    )
    try:
        with sessao.begin_nested():
            sessao.add(almoco)
            sessao.flush()
    except IntegrityError:
        raise AlmocoJaGeradoHoje() from None
    auditoria.registrar(
        sessao,
        ator,
        acao="almoco.confirmado_manual",
        entidade="almoco",
        entidade_id=almoco.id,
        descricao=f"Registrou manualmente o almoço de {colaborador.nome_completo}.",
        dados_novos={"status": "confirmado", "origem": "manual"},
    )
    return almoco


@dataclass
class ColaboradorParaAlmoco:
    id: uuid.UUID
    nome_completo: str
    codigo: str
    departamento: str | None


def buscar_colaboradores(sessao: Session, ator: Ator, busca: str) -> list[ColaboradorParaAlmoco]:
    """Busca mínima para o lançamento manual no painel.

    Existe separada de `colaboradores.listar` porque o refeitório precisa achar
    a pessoa, não conhecer o cadastro dela: aqui saem nome, código e
    departamento, e nada de codparc, matrícula, papel ou empresa — que é o que
    a listagem do admin devolve.
    """
    if ator.papel not in {"admin", "refeitorio"}:
        raise SemPermissao()

    termo = busca.strip()
    # Duas letras evitam que o campo vire uma listagem de todo mundo a cada
    # tecla; o teto de 20 evita que vire com três.
    if len(termo) < 2:
        return []

    padrao = f"%{termo}%"
    linhas = sessao.execute(
        select(Colaborador.id, Colaborador.nome_completo, Colaborador.codigo, Departamento.nome)
        .outerjoin(Departamento, Departamento.id == Colaborador.departamento_id)
        .where(
            Colaborador.ativo.is_(True),
            Colaborador.nome_completo.ilike(padrao) | Colaborador.codigo.ilike(padrao),
        )
        .order_by(Colaborador.nome_completo)
        .limit(20)
    ).all()
    return [
        ColaboradorParaAlmoco(id=i, nome_completo=nome, codigo=codigo, departamento=dep)
        for i, nome, codigo, dep in linhas
    ]
