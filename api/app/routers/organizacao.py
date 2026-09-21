"""Rotas de empresas e departamentos — o que o cadastro de colaborador precisa."""

import uuid

from fastapi import APIRouter

from app.core.deps import AdminLiberado, Sessao
from app.models.cadastro import Departamento, Empresa
from app.modules import organizacao
from app.schemas.comum import EntradaAtivo
from app.schemas.departamento import DepartamentoSaida, EntradaDepartamento
from app.schemas.empresa import EmpresaSaida, EntradaEmpresa

rotas = APIRouter(tags=["organização"])

@rotas.get("/empresas", response_model=list[EmpresaSaida])
def listar_empresas(
    ator: AdminLiberado, sessao: Sessao, apenas_ativas: bool = True
) -> list[Empresa]:
    return organizacao.listar_empresas(sessao, ator, apenas_ativas=apenas_ativas)

@rotas.post("/empresas", response_model=EmpresaSaida, status_code=201)
def criar_empresa(dados: EntradaEmpresa, ator: AdminLiberado, sessao: Sessao) -> Empresa:
    return organizacao.criar_empresa(sessao, ator, dados.codemp, dados.nome)

@rotas.patch("/empresas/{empresa_id}/ativo", response_model=EmpresaSaida)
def definir_empresa_ativa(
    empresa_id: uuid.UUID, dados: EntradaAtivo, ator: AdminLiberado, sessao: Sessao
) -> Empresa:
    return organizacao.definir_empresa_ativa(sessao, ator, empresa_id, dados.ativo)

@rotas.get("/departamentos", response_model=list[DepartamentoSaida])
def listar_departamentos(ator: AdminLiberado, sessao: Sessao) -> list[Departamento]:
    return organizacao.listar_departamentos(sessao, ator)

@rotas.post("/departamentos", response_model=DepartamentoSaida, status_code=201)
def criar_departamento(
    dados: EntradaDepartamento, ator: AdminLiberado, sessao: Sessao
) -> Departamento:
    return organizacao.criar_departamento(sessao, ator, dados.nome)
