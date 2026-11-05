"""Cria (ou apaga) os usuários do teste de carga, só no banco local.

Criar 150:   docker compose run --rm api python -m app.scripts.semear_carga 150
Apagar:      docker compose run --rm api python -m app.scripts.semear_carga --limpar

Os usuários são CARGA-0001..N (colaborador, todos com a mesma senha) e CARGA-REF
(refeitório). Recusa rodar em produção ou em banco que não seja o do compose.
"""

import sys

from sqlalchemy import delete, or_, select

from app.core import seguranca
from app.core.config import obter_config
from app.core.db import FabricaDeSessao, engine
from app.models.acesso import TentativaLogin
from app.models.auditoria import LogAcesso, LogAuditoria
from app.models.cadastro import Colaborador, Departamento, Empresa
from app.models.operacao import Almoco, Pedido
from app.modules import termos

SENHA = "carga-Teste-123"
PREFIXO = "CARGA-"
CODIGO_REF = f"{PREFIXO}REF"
BASE = 800_000


def _exigir_banco_local() -> None:
    local = engine.url.host in {"db", "localhost", "127.0.0.1"}
    if obter_config().ambiente == "producao" or not local:
        raise SystemExit(f"Recusado: banco '{engine.url.host}' não é o local.")


def _limpar() -> None:
    with FabricaDeSessao() as s:
        ids = list(s.scalars(select(Colaborador.id).where(Colaborador.codigo.like(f"{PREFIXO}%"))))
        s.execute(
            delete(Pedido).where(or_(Pedido.colaborador_id.in_(ids), Pedido.entregue_por.in_(ids)))
        )
        s.execute(
            delete(Almoco).where(
                or_(Almoco.colaborador_id.in_(ids), Almoco.confirmado_por.in_(ids))
            )
        )
        s.execute(delete(LogAuditoria).where(LogAuditoria.usuario_id.in_(ids)))
        s.execute(delete(LogAcesso).where(LogAcesso.codigo.like(f"{PREFIXO}%")))
        s.execute(delete(TentativaLogin).where(TentativaLogin.codigo.like(f"{PREFIXO}%")))
        s.execute(delete(Colaborador).where(Colaborador.id.in_(ids)))
        s.commit()
    print(f"{len(ids)} usuários de carga apagados, com os almoços e pedidos deles.")


def _criar(quantidade: int) -> None:
    hash_unico = seguranca.gerar_hash(SENHA)  # um hash só: gerar 150 levaria minutos
    with FabricaDeSessao() as s:
        empresa = s.scalar(select(Empresa))
        departamento = s.scalar(select(Departamento))
        if not empresa or not departamento:
            raise SystemExit("Faltam empresa/departamento. Rode antes: alembic upgrade head")
        existentes = set(
            s.scalars(select(Colaborador.codigo).where(Colaborador.codigo.like(f"{PREFIXO}%")))
        )
        pessoas = [(f"{PREFIXO}{i:04d}", "colaborador", BASE + i) for i in range(1, quantidade + 1)]
        pessoas.append((CODIGO_REF, "refeitorio", BASE))
        for codigo, papel, numero in pessoas:
            if codigo in existentes:
                continue
            s.add(
                Colaborador(
                    nome_completo=f"Carga {codigo}",
                    codigo=codigo,
                    codparc=numero,
                    vinculo="clt",
                    matricula=numero,
                    empresa_id=empresa.id,
                    departamento_id=departamento.id,
                    papel=papel,
                    senha_hash=hash_unico,
                    senha_provisoria=False,
                    termos_versao=termos.VERSAO_ATUAL,
                )
            )
        s.commit()
    print(f"{quantidade} colaboradores + {CODIGO_REF}. Senha de todos: {SENHA}")


if __name__ == "__main__":
    _exigir_banco_local()
    if sys.argv[1:] == ["--limpar"]:
        _limpar()
    elif len(sys.argv) == 2 and sys.argv[1].isdigit():
        _criar(int(sys.argv[1]))
    else:
        raise SystemExit(__doc__)
