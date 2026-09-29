"""Cria o primeiro admin de um ambiente sem nenhum colaborador.

É o "quebra o vidro" para quando não sobrou ninguém pra logar e cadastrar os
demais pela tela — mesmo caso do `redefinir_senha.py`, só que aqui não existe
nem colaborador para redefinir. Usa o mesmo caminho oficial de criação
(`colaboradores.criar`), então fica com a mesma validação, hash de senha e
auditoria de sempre — só a barreira de "precisa de um admin logado" é
substituída pelo acesso ao servidor.

    docker compose exec api python -m app.scripts.criar_admin \
        "Nome Completo" CODIGO CODPARC MATRICULA CODEMP

A senha aparece uma única vez.
"""

import sys

from sqlalchemy import select

from app.core.db import FabricaDeSessao
from app.models.cadastro import Empresa
from app.modules import colaboradores
from app.modules.auditoria import ATOR_CONSOLE
from app.modules.colaboradores import DadosColaborador


def main() -> int:
    if len(sys.argv) != 6:
        print(
            "uso: python -m app.scripts.criar_admin "
            "<nome completo> <codigo> <codparc> <matricula> <codemp>"
        )
        return 2

    nome_completo, codigo, codparc_str, matricula_str, codemp_str = sys.argv[1:]

    with FabricaDeSessao() as sessao:
        empresa = sessao.scalar(select(Empresa).where(Empresa.codemp == int(codemp_str)))
        if empresa is None:
            print(f"Não existe empresa com codemp {codemp_str}.")
            return 1

        colaborador, senha = colaboradores.criar(
            sessao,
            ATOR_CONSOLE,
            DadosColaborador(
                nome_completo=nome_completo,
                codigo=codigo.strip(),
                codparc=int(codparc_str),
                empresa_id=empresa.id,
                vinculo="clt",
                matricula=int(matricula_str),
                papel="admin",
            ),
        )
        sessao.commit()

    print()
    print(f"  {colaborador.nome_completo} — código {codigo}")
    print(f"  senha provisória: {senha}")
    print()
    print("  Aparece uma vez só. No primeiro login o sistema exige a troca.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
