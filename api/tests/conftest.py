import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, or_, select, text, update

from app.core import seguranca
from app.core.db import FabricaDeSessao
from app.main import app
from app.models.acesso import SolicitacaoSenha, TentativaLogin
from app.models.auditoria import LogAcesso, LogAuditoria
from app.models.cadastro import Colaborador, Empresa
from app.models.operacao import AjusteEstoque, Almoco, Pedido

SENHA = "senha-de-teste-123"
CODIGO = "T-LOGIN"
CODIGO_INATIVO = "T-INATIVO"
CODIGO_FANTASMA = "T-NAO-EXISTE"

_CODIGOS = [CODIGO, CODIGO_INATIVO, CODIGO_FANTASMA]

# Faixa reservada para documentação (RFC 5737) — nunca é um IP real.
IP_TESTE = "203.0.113.42"


@pytest.fixture(autouse=True)
def _limpar_contadores():
    """Os contadores vivem em transação própria, então não somem sozinhos
    entre testes — um teste contaminaria o seguinte."""
    def limpar():
        with FabricaDeSessao() as s:
            s.execute(delete(TentativaLogin).where(TentativaLogin.codigo.in_(_CODIGOS)))
            s.execute(text("delete from tentativas_ip where ip = :ip"), {"ip": IP_TESTE})
            s.commit()

    limpar()
    yield
    limpar()


def _limpar_sobras() -> None:
    """Apaga colaboradores de teste que uma execução interrompida deixou.

    O teardown de `dados` só roda se o teste chega ao fim. Uma suíte morta no
    meio — Ctrl-C, container reiniciado, duas execuções concorrentes — deixa
    `T-LOGIN` no banco, e a execução seguinte morre no índice único de
    `codigo` antes do primeiro teste rodar, com um IntegrityError que não tem
    nada a ver com o que se estava testando.

    Limpar na entrada custa uma consulta e torna a suíte reentrante.
    """
    with FabricaDeSessao() as s:
        sobras = list(s.scalars(select(Colaborador).where(Colaborador.codigo.in_(_CODIGOS))))
        if not sobras:
            return

        ids = [c.id for c in sobras]
        empresas = {c.empresa_id for c in sobras}

        # Ordem das chaves estrangeiras: o que aponta para o colaborador sai
        # antes dele, e a empresa sai por último.
        s.execute(
            delete(Pedido).where(
                or_(Pedido.colaborador_id.in_(ids), Pedido.entregue_por.in_(ids))
            )
        )
        s.execute(
            delete(Almoco).where(
                or_(Almoco.colaborador_id.in_(ids), Almoco.confirmado_por.in_(ids))
            )
        )
        # O ajuste é histórico do produto, não do colaborador: perde o autor,
        # não a movimentação.
        s.execute(
            update(AjusteEstoque)
            .where(AjusteEstoque.criado_por.in_(ids))
            .values(criado_por=None)
        )
        s.execute(delete(LogAuditoria).where(LogAuditoria.usuario_id.in_(ids)))
        s.execute(delete(LogAcesso).where(LogAcesso.codigo.in_(_CODIGOS)))
        s.execute(delete(SolicitacaoSenha).where(SolicitacaoSenha.codigo.in_(_CODIGOS)))
        s.execute(delete(TentativaLogin).where(TentativaLogin.codigo.in_(_CODIGOS)))
        s.execute(delete(Colaborador).where(Colaborador.id.in_(ids)))
        s.execute(delete(Empresa).where(Empresa.id.in_(empresas)))
        s.commit()


@pytest.fixture
def dados():
    """Cria empresa e colaboradores de teste e apaga tudo ao final."""
    _limpar_sobras()
    marca = uuid.uuid4().int % 100000
    with FabricaDeSessao() as s:
        empresa = Empresa(codemp=900000 + marca, nome="Empresa de Teste")
        s.add(empresa)
        s.flush()

        ativo = Colaborador(
            nome_completo="Fulano de Teste",
            codigo=CODIGO,
            codparc=900000 + marca,
            vinculo="clt",
            matricula=900000 + marca,
            empresa_id=empresa.id,
            papel="colaborador",
            senha_hash=seguranca.gerar_hash(SENHA),
            senha_provisoria=True,
        )
        inativo = Colaborador(
            nome_completo="Beltrano Inativo",
            codigo=CODIGO_INATIVO,
            codparc=910000 + marca,
            vinculo="pj",
            matricula=None,
            empresa_id=empresa.id,
            papel="colaborador",
            ativo=False,
            senha_hash=seguranca.gerar_hash(SENHA),
        )
        s.add_all([ativo, inativo])
        s.commit()
        ids = {"empresa": empresa.id, "ativo": ativo.id, "inativo": inativo.id}

    yield ids

    with FabricaDeSessao() as s:
        s.execute(delete(LogAcesso).where(LogAcesso.codigo.in_(_CODIGOS)))
        # o teste de varredura por IP gera dezenas de códigos descartáveis
        s.execute(delete(LogAcesso).where(LogAcesso.codigo.like("T-VARRE-%")))
        s.execute(delete(TentativaLogin).where(TentativaLogin.codigo.like("T-VARRE-%")))
        s.execute(delete(LogAuditoria).where(LogAuditoria.usuario_id.in_(list(ids.values()))))
        s.execute(delete(SolicitacaoSenha).where(SolicitacaoSenha.codigo.in_(_CODIGOS)))
        s.execute(delete(Colaborador).where(Colaborador.id.in_([ids["ativo"], ids["inativo"]])))
        s.execute(delete(Empresa).where(Empresa.id == ids["empresa"]))
        s.commit()


@pytest.fixture
def cliente():
    """Envia um IP válido em todas as chamadas: sem isso o limite por IP não é
    exercitado, porque 'testclient' não é endereço e é descartado na entrada."""
    with TestClient(app, headers={"x-forwarded-for": IP_TESTE}) as c:
        yield c


@pytest.fixture
def outro_cliente():
    """Segundo aparelho do mesmo usuário, com jogo de cookies independente."""
    with TestClient(app, headers={"x-forwarded-for": IP_TESTE}) as c:
        yield c


def eventos_de(codigo: str) -> list[tuple[str, str | None]]:
    with FabricaDeSessao() as s:
        return list(
            s.execute(
                select(LogAcesso.evento, LogAcesso.motivo)
                .where(LogAcesso.codigo == codigo)
                .order_by(LogAcesso.criado_em)
            ).all()
        )
