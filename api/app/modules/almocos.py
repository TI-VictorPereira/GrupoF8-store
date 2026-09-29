"""Fluxos de almoço: geração, confirmação por leitor e lançamento manual."""

import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from app.core.config import obter_config
from app.excecoes import (
    AlmocoExpirado,
    AlmocoJaConfirmado,
    AlmocoJaGeradoHoje,
    AlmocoNaoConfirmado,
    AlmocoNaoEncontrado,
    CodigoDeBarrasInvalido,
    ColaboradorNaoEncontrado,
    DepartamentoNaoEncontrado,
    NomeObrigatorio,
    PeriodoInvalido,
    SemPermissao,
    TermosNaoAceitos,
)
from app.models.cadastro import Colaborador, Departamento
from app.models.operacao import Almoco
from app.modules import auditoria, precos
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
    """O preço do dia, congelado no almoço que está sendo criado."""
    return precos.valor_vigente(sessao, agora.astimezone(ZoneInfo(_config.fuso)).date())


def _codigo_barras() -> str:
    """14 dígitos aleatórios.
    """
    return f"{secrets.randbelow(10**14):014d}"


def gerar(sessao: Session, ator: Ator) -> Almoco:
    agora = _agora()
    existente = _almoco_hoje(sessao, ator.id, agora)
    if existente is not None:
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
        with sessao.begin_nested():
            sessao.add(almoco)
            sessao.flush()
    except IntegrityError:
        existente = _almoco_hoje(sessao, ator.id, agora)
        if existente is not None:
            return existente
        raise
    return almoco


def registrar_visitante(
    sessao: Session, ator: Ator, nome: str, departamento_id: uuid.UUID, termos_aceitos: bool
) -> Almoco:
    """Cadastra e já libera o visitante — não existe conferência separada
    depois, então não faz sentido gerar código pra escanear em seguida.

    Quem chama precisa estar no totem autenticado como refeitório/admin; é a
    tela quem garante que o visitante leu o termo antes de digitar o nome, e
    é por isso que `termos_aceitos` é conferido aqui de novo — a tela pode
    até deixar de checar por algum bug, o servidor não deixa passar.
    """
    if ator.papel not in {"admin", "refeitorio"}:
        raise SemPermissao()
    if not termos_aceitos:
        raise TermosNaoAceitos()
    if not nome.strip():
        raise NomeObrigatorio(detalhes={"entidade": "visitante"})
    if sessao.get(Departamento, departamento_id) is None:
        raise DepartamentoNaoEncontrado()

    agora = _agora()
    almoco = Almoco(
        colaborador_id=None,
        empresa_id=None,
        visitante_nome=nome.strip(),
        visitante_departamento_id=departamento_id,
        vinculo="visitante",
        matricula=None,
        codigo_barras=_codigo_barras(),
        status="confirmado",
        origem="visitante",
        valor=_preco_vigente(sessao, agora),
        expira_em=agora + timedelta(minutes=_config.almoco_validade_minutos),
        confirmado_em=agora,
        confirmado_por=ator.id,
    )
    sessao.add(almoco)
    sessao.flush()
    auditoria.registrar(
        sessao,
        ator,
        acao="almoco.visitante_registrado",
        entidade="almoco",
        entidade_id=almoco.id,
        descricao=f"Registrou e liberou o visitante {almoco.visitante_nome}.",
        dados_novos={"visitante_nome": almoco.visitante_nome, "status": "confirmado"},
    )
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
    eh_visitante: bool = False


def meu_de_hoje(sessao: Session, ator: Ator) -> Almoco | None:
    """O que o colaborador vê na tela do almoço. Não cria nada."""
    return _almoco_hoje(sessao, ator.id, _agora())


_DepartamentoDoVisitante = aliased(Departamento)


def _entre(inicio: datetime, fim: datetime, status: str | None):
    consulta = (
        select(
            Almoco,
            Colaborador.nome_completo,
            Colaborador.codigo,
            Departamento.nome,
            _DepartamentoDoVisitante.nome,
        )
        .outerjoin(Colaborador, Colaborador.id == Almoco.colaborador_id)
        .outerjoin(Departamento, Departamento.id == Colaborador.departamento_id)
        .outerjoin(
            _DepartamentoDoVisitante,
            _DepartamentoDoVisitante.id == Almoco.visitante_departamento_id,
        )
        .where(Almoco.criado_em >= inicio, Almoco.criado_em < fim)
        .order_by(Almoco.criado_em.desc())
    )
    return consulta.where(Almoco.status == status) if status else consulta


def _linha_painel(
    almoco: Almoco,
    nome: str | None,
    codigo: str | None,
    dep: str | None,
    dep_visitante: str | None,
) -> LinhaPainel:
    if almoco.visitante_nome:
        return LinhaPainel(
            almoco=almoco,
            colaborador_nome=almoco.visitante_nome,
            colaborador_codigo="—",
            departamento=dep_visitante,
            eh_visitante=True,
        )
    return LinhaPainel(
        almoco=almoco, colaborador_nome=nome, colaborador_codigo=codigo, departamento=dep
    )


def expirar_vencidos(sessao: Session) -> int:
    """Marca como expirado o código pendente que passou da validade.

    Nada expira sozinho no banco. O `confirmar` já recusa código vencido, mas
    sem marcar o status o painel conta como "aguardando" gente que não vai
    aparecer — e o índice parcial continua impedindo a pessoa de gerar outro.

    Sem auditoria de propósito: aqui não se moveu estoque nem dinheiro, só o
    tempo passou. O próprio almoço guarda `expira_em` e o status novo.
    """
    resultado = sessao.execute(
        update(Almoco)
        .where(Almoco.status == "pendente", Almoco.expira_em <= _agora())
        .values(status="expirado")
    )
    return resultado.rowcount or 0


def listar_do_dia(sessao: Session, ator: Ator, status: str | None = None) -> list[LinhaPainel]:
    if not ator.eh_admin:
        raise SemPermissao()


    expirar_vencidos(sessao)
    inicio, fim = _limites_do_dia(_agora())
    return [
        _linha_painel(a, nome, codigo, dep, dep_visitante)
        for a, nome, codigo, dep, dep_visitante in sessao.execute(
            _entre(inicio, fim, status)
        ).all()
    ]


def listar_periodo(
    sessao: Session, ator: Ator, de: date, ate: date, status: str | None = None
) -> list[LinhaPainel]:
    """Histórico do admin. As datas são locais e o intervalo inclui os dois dias.

    Converter aqui, e não no router, evita a armadilha de comparar uma data
    local com `criado_em`, que é UTC: das 21h em diante o dia local já é o
    seguinte em UTC e os almoços da noite cairiam no dia errado.
    """
    if not ator.eh_admin:
        raise SemPermissao()
    if ate < de:
        raise PeriodoInvalido()

    fuso = ZoneInfo(_config.fuso)
    inicio = datetime(de.year, de.month, de.day, tzinfo=fuso).astimezone(UTC)
    fim = (datetime(ate.year, ate.month, ate.day, tzinfo=fuso) + timedelta(days=1)).astimezone(UTC)

    return [
        _linha_painel(a, nome, codigo, dep, dep_visitante)
        for a, nome, codigo, dep, dep_visitante in sessao.execute(_entre(inicio, fim, status)).all()
    ]


def desfazer_confirmacao(sessao: Session, ator: Ator, almoco_id: uuid.UUID) -> Almoco:
    """Corrige uma leitura feita por engano no totem.

    Volta para 'pendente' em vez de cancelar, para o colaborador poder ser
    confirmado de novo no mesmo dia — o índice parcial aceita, porque continua
    existindo um único almoço ativo.
    """
    if not ator.eh_admin:
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
    if not ator.eh_admin:
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
            # A origem continua sendo a de quem gerou o código; o que foi feito
            # na mão aqui é a confirmação, e é isso que a ação já diz.
            dados_anteriores={"status": "pendente"},
            dados_novos={"status": "confirmado"},
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


def listar_departamentos_para_visitante(sessao: Session, ator: Ator) -> list[Departamento]:
    """Pra tela de visitante escolher a área responsável, direto do totem.

    Separado de `organizacao.listar_departamentos` porque aquele exige admin,
    e quem cadastra visitante é o refeitório — mesmo motivo de existir
    `buscar_colaboradores` em vez de reaproveitar a listagem do admin.
    """
    if ator.papel not in {"admin", "refeitorio"}:
        raise SemPermissao()
    return list(sessao.scalars(select(Departamento).order_by(Departamento.nome)))


def buscar_colaboradores(sessao: Session, ator: Ator, busca: str) -> list[ColaboradorParaAlmoco]:
    """Busca mínima para o lançamento manual no painel.

    Existe separada de `colaboradores.listar` porque o refeitório precisa achar
    a pessoa, não conhecer o cadastro dela: aqui saem nome, código e
    departamento, e nada de codparc, matrícula, papel ou empresa — que é o que
    a listagem do admin devolve.
    """
    if not ator.eh_admin:
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


def nome_de(sessao: Session, colaborador_id: uuid.UUID) -> str:
    """O nome de quem acabou de ser liberado.

    Existe para o totem, que não carrega a fila do dia: sem a lista em cache
    não há de onde tirar o nome, e uma confirmação sem nome não diz ao operador
    se ele liberou a pessoa certa.
    """
    return sessao.scalar(
        select(Colaborador.nome_completo).where(Colaborador.id == colaborador_id)
    ) or "Almoço liberado"
