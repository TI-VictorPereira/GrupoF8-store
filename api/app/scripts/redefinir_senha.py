"""Redefine a senha de alguém pelo console do servidor.

É o "quebre o vidro" do sistema. Existe porque o reset normal é feito por um
admin logado, e isso deixa um buraco: se o único admin perder a própria senha,
não sobra ninguém para redefini-la e a saída seria UPDATE na mão no banco.

Só roda com acesso ao servidor, então a barreira é a mesma do SSH.

    docker compose exec api python -m app.scripts.redefinir_senha 1000

A senha aparece uma única vez, as sessões abertas daquela pessoa caem, e a
troca fica registrada em `log_auditoria` com ator marcado como console — para
uma redefinição feita por fora da tela não se confundir, na auditoria, com uma
feita pelo admin.
"""

import sys

from sqlalchemy import select

from app.core.db import FabricaDeSessao
from app.models.cadastro import Colaborador
from app.modules import colaboradores
from app.modules.auditoria import ATOR_CONSOLE


def main() -> int:
    if len(sys.argv) != 2:
        print("uso: python -m app.scripts.redefinir_senha <codigo>")
        return 2

    codigo = sys.argv[1].strip()

    with FabricaDeSessao() as sessao:
        pessoa = sessao.scalar(select(Colaborador).where(Colaborador.codigo == codigo))
        if pessoa is None:
            print(f"Não existe colaborador com o código {codigo}.")
            return 1

        senha = colaboradores.redefinir_senha(sessao, ATOR_CONSOLE, pessoa.id)
        sessao.commit()

    print()
    print(f"  {pessoa.nome_completo} — código {codigo}")
    print(f"  senha provisória: {senha}")
    print()
    print("  Aparece uma vez só. No próximo login o sistema exige a troca.")
    print("  As sessões abertas dessa pessoa foram derrubadas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
