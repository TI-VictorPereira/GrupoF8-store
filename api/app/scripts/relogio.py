"""Uma passada do relógio: expira o que venceu e mantém o Neon acordado.

Nada expira sozinho no banco — é a decisão de não usar trigger. As telas
expiram o que encontram, mas só rodam quando alguém as abre, e o posto do
refeitório deixou de carregar a fila. Sem este script, o pedido vencido de
sexta à noite segura estoque até segunda, e o almoço não retirado fica contado
como "aguardando" até um admin abrir a tela.

Roda em laço no serviço `relogio` do compose de produção. É idempotente: rodar
de novo não muda nada além do que venceu no intervalo.

    docker compose exec api python -m app.scripts.relogio
"""

from app.core.db import FabricaDeSessao
from app.modules import almocos, pedidos


def main() -> int:
    with FabricaDeSessao() as sessao:
        vencidos = pedidos.expirar_vencidos(sessao)
        almocos_vencidos = almocos.expirar_vencidos(sessao)
        sessao.commit()

    if vencidos:
        print(f"{len(vencidos)} pedido(s) expirado(s), itens devolvidos ao estoque:")
        for pedido in vencidos:
            print(f"  {pedido.codigo_retirada}  R$ {pedido.valor_total}")
    if almocos_vencidos:
        print(f"{almocos_vencidos} almoço(s) marcado(s) como expirado(s).")
    if not vencidos and not almocos_vencidos:
        print("Nada vencido.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
