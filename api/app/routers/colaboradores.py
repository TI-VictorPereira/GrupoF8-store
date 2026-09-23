"""Rotas de cadastro de colaboradores e atendimento de pedidos de senha."""

import uuid

from fastapi import APIRouter

from app.core.deps import AdminLiberado, Sessao
from app.models.cadastro import Colaborador
from app.modules import colaboradores
from app.modules.colaboradores import DadosColaborador
from app.schemas.colaborador import (
    ColaboradorComSenha,
    ColaboradorSaida,
    EntradaColaborador,
    EntradaImportacao,
    ResultadoImportacaoSaida,
    SenhaRedefinida,
    SolicitacaoSaida,
)
from app.schemas.comum import EntradaAtivo

rotas = APIRouter(prefix="/colaboradores", tags=["colaboradores"])


def _dados(entrada: EntradaColaborador) -> DadosColaborador:
    return DadosColaborador(
        nome_completo=entrada.nome_completo,
        codigo=entrada.codigo,
        codparc=entrada.codparc,
        empresa_id=entrada.empresa_id,
        vinculo=entrada.vinculo,
        matricula=entrada.matricula,
        papel=entrada.papel,
        departamento_id=entrada.departamento_id,
        mes_aniversario=entrada.mes_aniversario,
    )


@rotas.get("", response_model=list[ColaboradorSaida])
def listar(
    ator: AdminLiberado,
    sessao: Sessao,
    busca: str | None = None,
    apenas_ativos: bool = False,
) -> list[Colaborador]:
    return colaboradores.listar(sessao, ator, busca=busca, apenas_ativos=apenas_ativos)


@rotas.post("", response_model=ColaboradorComSenha, status_code=201)
def criar(
    dados: EntradaColaborador, ator: AdminLiberado, sessao: Sessao
) -> ColaboradorComSenha:
    colaborador, senha = colaboradores.criar(sessao, ator, _dados(dados))
    return ColaboradorComSenha(
        colaborador=ColaboradorSaida.model_validate(colaborador), senha_provisoria=senha
    )


@rotas.put("/{colaborador_id}", response_model=ColaboradorSaida)
def alterar(
    colaborador_id: uuid.UUID,
    dados: EntradaColaborador,
    ator: AdminLiberado,
    sessao: Sessao,
) -> Colaborador:
    return colaboradores.alterar(sessao, ator, colaborador_id, _dados(dados))


@rotas.patch("/{colaborador_id}/ativo", response_model=ColaboradorSaida)
def definir_ativo(
    colaborador_id: uuid.UUID, dados: EntradaAtivo, ator: AdminLiberado, sessao: Sessao
) -> Colaborador:
    return colaboradores.definir_ativo(sessao, ator, colaborador_id, dados.ativo)


@rotas.post("/{colaborador_id}/senha", response_model=SenhaRedefinida)
def redefinir_senha(
    colaborador_id: uuid.UUID, ator: AdminLiberado, sessao: Sessao
) -> SenhaRedefinida:
    """Sorteia uma senha temporária, mostra uma vez e derruba as sessões abertas."""
    colaborador = colaboradores.obter(sessao, ator, colaborador_id)
    senha = colaboradores.redefinir_senha(sessao, ator, colaborador_id)
    return SenhaRedefinida(codigo=colaborador.codigo, senha_provisoria=senha)


@rotas.post("/importar", response_model=ResultadoImportacaoSaida)
def importar(
    dados: EntradaImportacao, ator: AdminLiberado, sessao: Sessao
) -> ResultadoImportacaoSaida:
    resultado = colaboradores.importar(sessao, ator, [_dados(linha) for linha in dados.linhas])
    return ResultadoImportacaoSaida(
        criados=resultado.criados, senhas=resultado.senhas, erros=resultado.erros
    )


@rotas.get("/solicitacoes-senha", response_model=list[SolicitacaoSaida])
def listar_solicitacoes(ator: AdminLiberado, sessao: Sessao):
    return colaboradores.listar_solicitacoes(sessao, ator)


@rotas.post("/solicitacoes-senha/{solicitacao_id}/atender", response_model=SenhaRedefinida)
def atender_solicitacao(
    solicitacao_id: uuid.UUID, ator: AdminLiberado, sessao: Sessao
) -> SenhaRedefinida:
    codigo, senha = colaboradores.atender_solicitacao(sessao, ator, solicitacao_id)
    return SenhaRedefinida(codigo=codigo, senha_provisoria=senha)


@rotas.post("/solicitacoes-senha/{solicitacao_id}/descartar", status_code=204)
def descartar_solicitacao(solicitacao_id: uuid.UUID, ator: AdminLiberado, sessao: Sessao) -> None:
    colaboradores.descartar_solicitacao(sessao, ator, solicitacao_id)
