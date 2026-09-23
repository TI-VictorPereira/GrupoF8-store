"""Cadastro de colaboradores, importação em massa e reset de senha.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import seguranca
from app.core.config import obter_config
from app.excecoes import (
    AutoInativacao,
    CadastroDuplicado,
    CodigoDuplicado,
    CodparcDuplicado,
    ColaboradorNaoEncontrado,
    DepartamentoNaoEncontrado,
    EmpresaNaoEncontrada,
    ImportacaoGrandeDemais,
    ImportacaoVazia,
    MatriculaDuplicada,
    MatriculaNaoPermitida,
    MatriculaObrigatoria,
    MesAniversarioInvalido,
    PapelInvalido,
    SemPermissao,
    SolicitacaoJaTratada,
    SolicitacaoNaoEncontrada,
    VinculoInvalido,
)
from app.models.acesso import SolicitacaoSenha
from app.models.cadastro import PAPEIS, Colaborador, Departamento, Empresa
from app.modules import auditoria
from app.modules.auditoria import Ator

_config = obter_config()


@dataclass
class DadosColaborador:
    nome_completo: str
    codigo: str
    codparc: int
    empresa_id: uuid.UUID
    vinculo: str = "clt"
    matricula: int | None = None
    papel: str = "colaborador"
    departamento_id: uuid.UUID | None = None
    mes_aniversario: int | None = None


@dataclass
class ResultadoImportacao:
    criados: int = 0
    senhas: dict[str, str] = field(default_factory=dict)
    erros: list[str] = field(default_factory=list)


def _exigir_admin(ator: Ator) -> None:
    if not ator.eh_admin:
        raise SemPermissao()


def _traduzir_duplicidade(erro: IntegrityError) -> Exception:
    """Converte a violação de constraint no erro de negócio correspondente.

    A checagem prévia em código serve para dar mensagem decente; quem garante a
    unicidade sob concorrência é o banco. Os dois caminhos precisam chegar na
    mesma resposta, senão duas requisições simultâneas devolvem coisas
    diferentes para o mesmo problema.
    """
    detalhe = str(erro.orig).lower()
    if "codparc" in detalhe:
        return CodparcDuplicado()
    if "empresa_matricula" in detalhe or "matricula" in detalhe:
        return MatriculaDuplicada()
    if "codigo" in detalhe:
        return CodigoDuplicado()
    return CadastroDuplicado()


def _validar(sessao: Session, dados: DadosColaborador) -> None:
    if dados.vinculo not in {"clt", "pj"}:
        raise VinculoInvalido(detalhes={"vinculo": dados.vinculo})
    if dados.papel not in set(PAPEIS):
        raise PapelInvalido(detalhes={"papel": dados.papel})
    if dados.mes_aniversario is not None and not 1 <= dados.mes_aniversario <= 12:
        raise MesAniversarioInvalido(detalhes={"mes": dados.mes_aniversario})
    if dados.vinculo == "clt" and dados.matricula is None:
        raise MatriculaObrigatoria()
    if dados.vinculo == "pj" and dados.matricula is not None:
        raise MatriculaNaoPermitida()
    if sessao.get(Empresa, dados.empresa_id) is None:
        raise EmpresaNaoEncontrada()
    if dados.departamento_id and sessao.get(Departamento, dados.departamento_id) is None:
        raise DepartamentoNaoEncontrado()


def _retrato(colaborador: Colaborador) -> dict[str, Any]:
    return {
        "nome_completo": colaborador.nome_completo,
        "codigo": colaborador.codigo,
        "codparc": colaborador.codparc,
        "vinculo": colaborador.vinculo,
        "matricula": colaborador.matricula,
        "empresa_id": str(colaborador.empresa_id),
        "papel": colaborador.papel,
        "ativo": colaborador.ativo,
    }


def _aplicar_senha_provisoria(colaborador: Colaborador) -> str:
    """Sorteia a senha, marca a validade e corta as sessões abertas."""
    senha = seguranca.gerar_senha_temporaria()
    colaborador.senha_hash = seguranca.gerar_hash(senha)
    colaborador.senha_provisoria = True
    colaborador.senha_provisoria_expira_em = datetime.now(timezone.utc) + timedelta(
        hours=_config.senha_provisoria_validade_horas
    )
    colaborador.sessao_versao = (colaborador.sessao_versao or 0) + 1
    return senha


# --------------------------------------------------------------------- leitura


def listar(
    sessao: Session, ator: Ator, *, busca: str | None = None, apenas_ativos: bool = False
) -> list[Colaborador]:
    _exigir_admin(ator)
    consulta = select(Colaborador).order_by(Colaborador.nome_completo)
    if apenas_ativos:
        consulta = consulta.where(Colaborador.ativo.is_(True))
    if busca:
        termo = f"%{busca.strip()}%"
        consulta = consulta.where(
            Colaborador.nome_completo.ilike(termo) | Colaborador.codigo.ilike(termo)
        )
    return list(sessao.scalars(consulta))


def obter(sessao: Session, ator: Ator, colaborador_id: uuid.UUID) -> Colaborador:
    _exigir_admin(ator)
    colaborador = sessao.get(Colaborador, colaborador_id)
    if colaborador is None:
        raise ColaboradorNaoEncontrado()
    return colaborador


# --------------------------------------------------------------------- escrita


def criar(sessao: Session, ator: Ator, dados: DadosColaborador) -> tuple[Colaborador, str]:
    """Devolve o colaborador e a senha provisória — que só existe em texto aqui."""
    _exigir_admin(ator)
    _validar(sessao, dados)

    colaborador = Colaborador(
        nome_completo=dados.nome_completo.strip(),
        codigo=dados.codigo.strip(),
        codparc=dados.codparc,
        vinculo=dados.vinculo,
        matricula=dados.matricula,
        mes_aniversario=dados.mes_aniversario,
        empresa_id=dados.empresa_id,
        papel=dados.papel,
        departamento_id=dados.departamento_id,
        ativo=True,
        senha_hash="",
    )
    senha = _aplicar_senha_provisoria(colaborador)

    try:
        with sessao.begin_nested():
            sessao.add(colaborador)
            sessao.flush()
    except IntegrityError as erro:
        raise _traduzir_duplicidade(erro) from None

    auditoria.registrar(
        sessao,
        ator,
        acao="colaborador.criado",
        entidade="colaborador",
        entidade_id=colaborador.id,
        descricao=f"Cadastrou {colaborador.nome_completo} (código {colaborador.codigo}).",
        dados_novos=_retrato(colaborador),
    )
    return colaborador, senha


def alterar(
    sessao: Session, ator: Ator, colaborador_id: uuid.UUID, dados: DadosColaborador
) -> Colaborador:
    _exigir_admin(ator)
    colaborador = obter(sessao, ator, colaborador_id)
    _validar(sessao, dados)

    antes = _retrato(colaborador)

    colaborador.nome_completo = dados.nome_completo.strip()
    colaborador.codigo = dados.codigo.strip()
    colaborador.codparc = dados.codparc
    colaborador.vinculo = dados.vinculo
    colaborador.matricula = dados.matricula
    colaborador.mes_aniversario = dados.mes_aniversario
    colaborador.empresa_id = dados.empresa_id
    colaborador.papel = dados.papel
    colaborador.departamento_id = dados.departamento_id

    try:
        sessao.flush()
    except IntegrityError as erro:
        raise _traduzir_duplicidade(erro) from None

    depois = _retrato(colaborador)

    if antes["vinculo"] != depois["vinculo"]:
        auditoria.registrar(
            sessao,
            ator,
            acao="colaborador.vinculo_alterado",
            entidade="colaborador",
            entidade_id=colaborador.id,
            descricao=(
                f"Alterou o vínculo de {colaborador.nome_completo}: "
                f"{antes['vinculo']} para {depois['vinculo']}."
            ),
            dados_anteriores={"vinculo": antes["vinculo"], "matricula": antes["matricula"]},
            dados_novos={"vinculo": depois["vinculo"], "matricula": depois["matricula"]},
        )
    if antes["empresa_id"] != depois["empresa_id"]:
        auditoria.registrar(
            sessao,
            ator,
            acao="colaborador.empresa_alterada",
            entidade="colaborador",
            entidade_id=colaborador.id,
            descricao=f"Transferiu {colaborador.nome_completo} de empresa.",
            dados_anteriores={"empresa_id": antes["empresa_id"]},
            dados_novos={"empresa_id": depois["empresa_id"]},
        )

    restantes = {c for c in antes if antes[c] != depois[c]} - {"vinculo", "matricula", "empresa_id"}
    if restantes:
        auditoria.registrar(
            sessao,
            ator,
            acao="colaborador.alterado",
            entidade="colaborador",
            entidade_id=colaborador.id,
            descricao=f"Alterou o cadastro de {colaborador.nome_completo}.",
            dados_anteriores={c: antes[c] for c in restantes},
            dados_novos={c: depois[c] for c in restantes},
        )
    return colaborador


def definir_ativo(
    sessao: Session, ator: Ator, colaborador_id: uuid.UUID, ativo: bool
) -> Colaborador:
    _exigir_admin(ator)
    colaborador = obter(sessao, ator, colaborador_id)
    if colaborador.id == ator.id and not ativo:
        raise AutoInativacao()
    if colaborador.ativo == ativo:
        return colaborador

    colaborador.ativo = ativo
    if not ativo:
        # Inativar precisa expulsar de imediato, não só impedir novo login.
        colaborador.sessao_versao = (colaborador.sessao_versao or 0) + 1

    auditoria.registrar(
        sessao,
        ator,
        acao="colaborador.reativado" if ativo else "colaborador.inativado",
        entidade="colaborador",
        entidade_id=colaborador.id,
        descricao=(
            f"{'Reativou' if ativo else 'Inativou'} o acesso de {colaborador.nome_completo}."
        ),
        dados_anteriores={"ativo": not ativo},
        dados_novos={"ativo": ativo},
    )
    return colaborador


def redefinir_senha(sessao: Session, ator: Ator, colaborador_id: uuid.UUID) -> str:
    """Devolve a senha provisória em texto. É a única vez que ela existe assim."""
    _exigir_admin(ator)
    colaborador = obter(sessao, ator, colaborador_id)
    senha = _aplicar_senha_provisoria(colaborador)

    auditoria.registrar(
        sessao,
        ator,
        acao="colaborador.senha_redefinida",
        entidade="colaborador",
        entidade_id=colaborador.id,
        descricao=f"Redefiniu a senha de {colaborador.nome_completo}.",
        # A senha nunca entra na auditoria, nem o hash.
        dados_novos={"senha_provisoria": True},
    )
    return senha


def importar(
    sessao: Session, ator: Ator, linhas: list[DadosColaborador]
) -> ResultadoImportacao:
    """Importa em lote, pulando as linhas com problema em vez de abortar tudo.

    Cada linha entra num savepoint: uma falha não derruba as anteriores. O
    commit continua sendo na borda da requisição — ou o lote inteiro entra, ou
    nada entra, se algo estourar depois.
    """
    _exigir_admin(ator)
    if not linhas:
        raise ImportacaoVazia()
    if len(linhas) > 500:
        raise ImportacaoGrandeDemais()

    resultado = ResultadoImportacao()
    for indice, dados in enumerate(linhas, start=1):
        try:
            colaborador, senha = criar(sessao, ator, dados)
            resultado.criados += 1
            resultado.senhas[colaborador.codigo] = senha
        except Exception as erro:  # noqa: BLE001 — a linha ruim não pode parar o lote
            mensagem = getattr(erro, "mensagem", None) or type(erro).__name__
            resultado.erros.append(f"linha {indice} ({dados.codigo}): {mensagem}")

    auditoria.registrar(
        sessao,
        ator,
        acao="colaboradores.importados",
        entidade="colaborador",
        descricao=(
            f"Importou {resultado.criados} colaborador(es); "
            f"{len(resultado.erros)} linha(s) com erro."
        ),
        dados_novos={"criados": resultado.criados, "erros": resultado.erros},
    )
    return resultado


# ------------------------------------------------------- solicitações de senha


def listar_solicitacoes(sessao: Session, ator: Ator) -> list[SolicitacaoSenha]:
    _exigir_admin(ator)
    return list(
        sessao.scalars(
            select(SolicitacaoSenha)
            .where(SolicitacaoSenha.status == "aberta")
            .order_by(SolicitacaoSenha.criado_em)
        )
    )


def atender_solicitacao(sessao: Session, ator: Ator, solicitacao_id: uuid.UUID) -> tuple[str, str]:
    """Redefine a senha do código pedido e fecha a solicitação.

    Devolve (código do colaborador, senha provisória).
    """
    _exigir_admin(ator)
    solicitacao = sessao.get(SolicitacaoSenha, solicitacao_id)
    if solicitacao is None:
        raise SolicitacaoNaoEncontrada()
    if solicitacao.status != "aberta":
        raise SolicitacaoJaTratada()

    colaborador = sessao.scalar(
        select(Colaborador).where(Colaborador.codigo == solicitacao.codigo)
    )
    if colaborador is None:
        # O pedido é aberto sem validar o código, de propósito: a tela de login
        # não pode revelar quais existem. A conferência acontece aqui.
        raise ColaboradorNaoEncontrado("Não existe colaborador com o código informado.")

    senha = redefinir_senha(sessao, ator, colaborador.id)
    solicitacao.status = "atendida"
    solicitacao.atendido_em = datetime.now(timezone.utc)
    solicitacao.atendido_por = ator.id
    return colaborador.codigo, senha


def descartar_solicitacao(sessao: Session, ator: Ator, solicitacao_id: uuid.UUID) -> None:
    _exigir_admin(ator)
    solicitacao = sessao.get(SolicitacaoSenha, solicitacao_id)
    if solicitacao is None:
        raise SolicitacaoNaoEncontrada()
    if solicitacao.status != "aberta":
        raise SolicitacaoJaTratada()

    solicitacao.status = "descartada"
    solicitacao.atendido_em = datetime.now(timezone.utc)
    solicitacao.atendido_por = ator.id
