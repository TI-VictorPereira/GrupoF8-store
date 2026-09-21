"""Rotas do colaborador e do totem para almoço."""

import uuid
from datetime import date

from fastapi import APIRouter

from app.core.deps import AdminLiberado, AtorLiberado, RefeitorioOuAdminLiberado, Sessao
from app.models.operacao import Almoco
from app.modules import almocos
from app.schemas.almoco import (
    AlmocoSaida,
    EntradaAlmocoManual,
    EntradaConfirmacaoAlmoco,
    LinhaPainelSaida,
)
from app.schemas.colaborador import ColaboradorResumo

rotas = APIRouter(prefix="/almocos", tags=["almoços"])


@rotas.post("/gerar", response_model=AlmocoSaida, status_code=201)
def gerar(ator: AtorLiberado, sessao: Sessao) -> Almoco:
    return almocos.gerar(sessao, ator)


@rotas.post("/confirmar", response_model=AlmocoSaida)
def confirmar(
    dados: EntradaConfirmacaoAlmoco, ator: RefeitorioOuAdminLiberado, sessao: Sessao
) -> Almoco:
    return almocos.confirmar(sessao, ator, dados.codigo_barras.strip())


@rotas.post("/manual", response_model=AlmocoSaida, status_code=201)
def manual(dados: EntradaAlmocoManual, ator: RefeitorioOuAdminLiberado, sessao: Sessao) -> Almoco:
    return almocos.registrar_manual(sessao, ator, dados.colaborador_id)


@rotas.get("/meu-hoje", response_model=AlmocoSaida | None)
def meu_hoje(ator: AtorLiberado, sessao: Sessao) -> Almoco | None:
    """Consulta pura: não gera código. Gerar é sempre ação explícita do usuário."""
    return almocos.meu_de_hoje(sessao, ator)


@rotas.get("/hoje", response_model=list[LinhaPainelSaida])
def do_dia(
    ator: RefeitorioOuAdminLiberado, sessao: Sessao, status: str | None = None
) -> list[LinhaPainelSaida]:
    return [
        LinhaPainelSaida(
            almoco=AlmocoSaida.model_validate(linha.almoco),
            colaborador_nome=linha.colaborador_nome,
            colaborador_codigo=linha.colaborador_codigo,
            departamento=linha.departamento,
        )
        for linha in almocos.listar_do_dia(sessao, ator, status)
    ]


@rotas.post("/{almoco_id}/desfazer", response_model=AlmocoSaida)
def desfazer(
    almoco_id: uuid.UUID, ator: RefeitorioOuAdminLiberado, sessao: Sessao
) -> Almoco:
    """Corrige leitura feita por engano. Volta para pendente, não cancela."""
    return almocos.desfazer_confirmacao(sessao, ator, almoco_id)


@rotas.get("/colaboradores", response_model=list[ColaboradorResumo])
def colaboradores_para_lancamento(
    busca: str, ator: RefeitorioOuAdminLiberado, sessao: Sessao
) -> list[almocos.ColaboradorParaAlmoco]:
    """Só para o lançamento manual. Devolve menos que a listagem do admin."""
    return almocos.buscar_colaboradores(sessao, ator, busca)


@rotas.get("", response_model=list[LinhaPainelSaida])
def historico(
    de: date,
    ate: date,
    ator: AdminLiberado,
    sessao: Sessao,
    status: str | None = None,
) -> list[LinhaPainelSaida]:
    """Histórico por intervalo de datas locais, com os dois extremos incluídos."""
    return [
        LinhaPainelSaida(
            almoco=AlmocoSaida.model_validate(linha.almoco),
            colaborador_nome=linha.colaborador_nome,
            colaborador_codigo=linha.colaborador_codigo,
            departamento=linha.departamento,
        )
        for linha in almocos.listar_periodo(sessao, ator, de, ate, status)
    ]
