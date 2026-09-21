"""Expira pedidos pendentes antigos e devolve o estoque.

A tela de entregas já expira o que encontra, mas ela só roda quando alguém a
abre. Este script fecha o resto: numa sexta à noite, o estoque volta para a
prateleira sem esperar segunda de manhã.
"""

from app.core.db import FabricaDeSessao
from app.modules import pedidos


def main() -> int:
    with FabricaDeSessao() as sessao:
        vencidos = pedidos.expirar_vencidos(sessao)
        sessao.commit()

    if not vencidos:
        print("Nenhum pedido vencido.")
        return 0

    print(f"{len(vencidos)} pedido(s) expirado(s), itens devolvidos ao estoque:")
    for pedido in vencidos:
        print(f"  {pedido.codigo_retirada}  R$ {pedido.valor_total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
