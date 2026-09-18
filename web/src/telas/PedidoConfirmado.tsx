import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { api } from "@/api/cliente";
import { Carregando } from "@/componentes/Carregando";
import { Moldura } from "@/componentes/Moldura";
import { dataHora, dinheiro } from "@/comum/formato";
import type { Pedido } from "@/interfaces/loja";

export function PedidoConfirmado({ pedidoId }: { pedidoId: string }) {
  // A API só expõe os pedidos do próprio colaborador, então buscar na lista
  // dele é também a garantia de que ninguém abre o pedido de outra pessoa.
  const pedidos = useQuery({
    queryKey: ["meus-pedidos"],
    queryFn: () => api.get<Pedido[]>("/pedidos/me"),
  });
  const pedido = pedidos.data?.find((p) => p.id === pedidoId);

  return (
    <Moldura>
      {pedidos.isLoading && <Carregando texto="Carregando pedido…" />}
      {pedidos.data && !pedido && (
        <p className="p-6 text-sm text-suave">Pedido não encontrado.</p>
      )}

      {pedido && (
        <div className="p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl font-black text-ink">
            ✓
          </div>
          <h1 className="mt-4 text-base font-bold">Pedido confirmado</h1>
          <p className="mt-1 text-xs text-suave">
            Retire na recepção apresentando o código abaixo.
          </p>

          <div className="mt-5 rounded-xl bg-ink py-5 text-white">
            <p className="text-[11px] text-white/50">Código de retirada</p>
            <p className="mt-1 text-3xl font-black tracking-[0.2em]">{pedido.codigo_retirada}</p>
          </div>

          <div className="mt-4 rounded-xl border border-borda p-4 text-left">
            <p className="mb-2 text-[11px] text-muito-suave">{dataHora(pedido.criado_em)}</p>
            {pedido.itens.map((item) => (
              <div key={item.id} className="flex justify-between py-1 text-[13px]">
                <span className="text-suave">
                  {item.quantidade}× {item.nome_produto}
                </span>
                <span className="font-semibold">
                  {dinheiro(Number(item.preco_unitario) * item.quantidade)}
                </span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-borda pt-2 text-sm font-extrabold">
              <span>Total</span>
              <span>{dinheiro(pedido.valor_total)}</span>
            </div>
          </div>

          <Link
            to="/"
            className="mt-5 block rounded-lg bg-accent py-2.5 text-center text-sm font-bold text-ink"
          >
            Voltar ao início
          </Link>
        </div>
      )}
    </Moldura>
  );
}
