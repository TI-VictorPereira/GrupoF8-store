"""Rotas do colaborador e do totem para almoço."""

import uuid
from datetime import date

from fastapi import APIRouter

from app.core.deps import (
    AdminLiberado,
    ConsumidorLiberado,
    RefeitorioOuAdminLiberado,
    Sessao,
)
from app.models.cadastro import PrecoAlmoco
from app.models.operacao import Almoco
from app.modules import almocos, precos
from app.schemas.almoco import (
    AlmocoSaida,
    ConfirmacaoSaida,
    EntradaAlmocoManual,
    EntradaConfirmacaoAlmoco,
    EntradaPrecoAlmoco,
    LinhaPainelSaida,
    PrecoAlmocoSaida,
)
from app.schemas.colaborador import ColaboradorResumo

rotas = APIRouter(prefix="/almocos", tags=["almoços"])


@rotas.get("/preco", response_model=PrecoAlmocoSaida | None)
def preco_vigente(ator: ConsumidorLiberado, sessao: Sessao) -> PrecoAlmoco | None:
    """Para quem consome: é o valor que a pessoa vai gastar hoje."""
    return precos.vigente(sessao)


@rotas.put("/preco", response_model=PrecoAlmocoSaida)
def definir_preco(dados: EntradaPrecoAlmoco, ator: AdminLiberado, sessao: Sessao) -> PrecoAlmoco:
    """Abre uma vigência nova. Não altera o valor dos almoços já lançados."""
    return precos.definir(sessao, ator, dados.valor, dados.vigencia_inicio)


@rotas.get("/precos", response_model=list[PrecoAlmocoSaida])
def historico_de_precos(ator: AdminLiberado, sessao: Sessao) -> list[PrecoAlmoco]:
    return precos.historico(sessao, ator)


@rotas.post("/gerar", response_model=AlmocoSaida, status_code=201)
def gerar(ator: ConsumidorLiberado, sessao: Sessao) -> Almoco:
    return almocos.gerar(sessao, ator)


@rotas.post("/confirmar", response_model=ConfirmacaoSaida)
def confirmar(
    dados: EntradaConfirmacaoAlmoco, ator: RefeitorioOuAdminLiberado, sessao: Sessao
) -> ConfirmacaoSaida:
    almoco = almocos.confirmar(sessao, ator, dados.codigo_barras.strip())
    return ConfirmacaoSaida(
        **AlmocoSaida.model_validate(almoco).model_dump(),
        colaborador_nome=almocos.nome_de(sessao, almoco.colaborador_id),
    )


@rotas.post("/manual", response_model=AlmocoSaida, status_code=201)
def manual(dados: EntradaAlmocoManual, ator: AdminLiberado, sessao: Sessao) -> Almoco:
    return almocos.registrar_manual(sessao, ator, dados.colaborador_id)


@rotas.get("/meu-hoje", response_model=AlmocoSaida | None)
def meu_hoje(ator: ConsumidorLiberado, sessao: Sessao) -> Almoco | None:
    """Consulta pura: não gera código. Gerar é sempre ação explícita do usuário."""
    return almocos.meu_de_hoje(sessao, ator)


@rotas.get("/hoje", response_model=list[LinhaPainelSaida])
def do_dia(
    ator: AdminLiberado, sessao: Sessao, status: str | None = None
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
    almoco_id: uuid.UUID, ator: AdminLiberado, sessao: Sessao
) -> Almoco:
    """Corrige leitura feita por engano. Volta para pendente, não cancela."""
    return almocos.desfazer_confirmacao(sessao, ator, almoco_id)


@rotas.get("/colaboradores", response_model=list[ColaboradorResumo])
def colaboradores_para_lancamento(
    busca: str, ator: AdminLiberado, sessao: Sessao
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
