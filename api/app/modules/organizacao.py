"""Empresas e departamentos.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.excecoes import (
    CodempDuplicado,
    CodempInvalido,
    DepartamentoDuplicado,
    EmpresaComColaboradores,
    EmpresaNaoEncontrada,
    NomeObrigatorio,
    SemPermissao,
)
from app.models.cadastro import Departamento, Empresa
from app.modules import auditoria
from app.modules.auditoria import Ator


def _exigir_admin(ator: Ator) -> None:
    if not ator.eh_admin:
        raise SemPermissao()


# -------------------------------------------------------------------- empresas


def listar_empresas(sessao: Session, ator: Ator, *, apenas_ativas: bool = True) -> list[Empresa]:
    _exigir_admin(ator)
    consulta = select(Empresa).order_by(Empresa.codemp)
    if apenas_ativas:
        consulta = consulta.where(Empresa.ativo.is_(True))
    return list(sessao.scalars(consulta))


def criar_empresa(sessao: Session, ator: Ator, codemp: int, nome: str) -> Empresa:
    _exigir_admin(ator)
    if codemp <= 0:
        raise CodempInvalido()
    if not nome.strip():
        raise NomeObrigatorio(detalhes={"entidade": "empresa"})

    empresa = Empresa(codemp=codemp, nome=nome.strip())
    try:
        with sessao.begin_nested():
            sessao.add(empresa)
            sessao.flush()
    except IntegrityError:
        raise CodempDuplicado(detalhes={"codemp": codemp}) from None

    auditoria.registrar(
        sessao,
        ator,
        acao="empresa.criada",
        entidade="empresa",
        entidade_id=empresa.id,
        descricao=f"Cadastrou a empresa {empresa.nome} (codemp {empresa.codemp}).",
        dados_novos={"codemp": empresa.codemp, "nome": empresa.nome},
    )
    return empresa


def definir_empresa_ativa(
    sessao: Session, ator: Ator, empresa_id: uuid.UUID, ativo: bool
) -> Empresa:
    _exigir_admin(ator)
    empresa = sessao.get(Empresa, empresa_id)
    if empresa is None:
        raise EmpresaNaoEncontrada()
    if empresa.ativo == ativo:
        return empresa

    if not ativo:
        # Inativar com gente dentro deixaria colaboradores sem empresa válida
        # para lançar o consumo — o erro só apareceria no fechamento do mês.
        from app.models.cadastro import Colaborador

        vinculados = sessao.scalar(
            select(Colaborador.id)
            .where(Colaborador.empresa_id == empresa_id, Colaborador.ativo.is_(True))
            .limit(1)
        )
        if vinculados:
            raise EmpresaComColaboradores()

    empresa.ativo = ativo
    auditoria.registrar(
        sessao,
        ator,
        acao="empresa.reativada" if ativo else "empresa.inativada",
        entidade="empresa",
        entidade_id=empresa.id,
        descricao=f"{'Reativou' if ativo else 'Inativou'} a empresa {empresa.nome}.",
        dados_anteriores={"ativo": not ativo},
        dados_novos={"ativo": ativo},
    )
    return empresa


# --------------------------------------------------------------- departamentos


def listar_departamentos(sessao: Session, ator: Ator) -> list[Departamento]:
    _exigir_admin(ator)
    return list(sessao.scalars(select(Departamento).order_by(Departamento.nome)))


def criar_departamento(sessao: Session, ator: Ator, nome: str) -> Departamento:
    _exigir_admin(ator)
    if not nome.strip():
        raise NomeObrigatorio(detalhes={"entidade": "departamento"})

    departamento = Departamento(nome=nome.strip())
    try:
        with sessao.begin_nested():
            sessao.add(departamento)
            sessao.flush()
    except IntegrityError:
        raise DepartamentoDuplicado() from None

    auditoria.registrar(
        sessao,
        ator,
        acao="departamento.criado",
        entidade="departamento",
        entidade_id=departamento.id,
        descricao=f"Cadastrou o departamento {departamento.nome}.",
        dados_novos={"nome": departamento.nome},
    )
    return departamento
