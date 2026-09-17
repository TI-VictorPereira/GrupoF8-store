import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Protegido } from "@/components/f8/Protegido";
import { ColabFrame } from "@/components/f8/ColabShell";
import { fmt, horaFmt } from "@/lib/f8/format";
import type { ItemPedido, Pedido } from "@/lib/f8/types";

export const Route = createFileRoute("/loja_/sucesso/$pedidoId")({
  head: () => ({
    meta: [
      { title: "Pedido confirmado — Loja Interna F8" },
      { name: "description", content: "Código de retirada do seu pedido na loja interna F8." },
      { property: "og:title", content: "Pedido confirmado — Loja Interna F8" },
      {
        property: "og:description",
        content: "Código de retirada do seu pedido na loja interna F8.",
      },
    ],
  }),
  component: () => (
    <Protegido papeis={["colaborador", "admin", "refeitorio"]}>
      <Sucesso />
    </Protegido>
  ),
});

function Sucesso() {
  const { pedidoId } = Route.useParams();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [itens, setItens] = useState<ItemPedido[]>([]);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase
        .from("pedidos")
        .select("*")
        .eq("id", pedidoId)
        .maybeSingle();
      const { data: i } = await supabase.from("itens_pedido").select("*").eq("pedido_id", pedidoId);
      setPedido((p as Pedido) ?? null);
      setItens((i ?? []) as ItemPedido[]);
    })();
  }, [pedidoId]);

  return (
    <ColabFrame>
      {!pedido ? (
        <p className="p-6 text-sm text-muted-foreground">Carregando pedido…</p>
      ) : (
        <div className="p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-accent text-ink mx-auto flex items-center justify-center text-2xl font-black">
            ✓
          </div>
          <h2 className="font-bold text-base mt-4">Pedido confirmado</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Retire na recepção apresentando o código abaixo.
          </p>

          <div className="bg-ink text-bg rounded-xl py-5 mt-5">
            <p className="text-bg/50 text-[11px]">Código de retirada</p>
            <p className="text-3xl font-black tracking-[0.2em] mt-1">{pedido.codigo_retirada}</p>
          </div>

          <div className="border border-border rounded-xl p-4 mt-4 text-left">
            <p className="text-[11px] text-muted-soft mb-2">{horaFmt(pedido.criado_em)}</p>
            {itens.map((item) => (
              <div key={item.id} className="flex justify-between text-[13px] py-1">
                <span className="text-muted-foreground">
                  {item.quantidade}× {item.nome_produto}
                </span>
                <span className="font-semibold">
                  {fmt(Number(item.preco_unitario) * item.quantidade)}
                </span>
              </div>
            ))}
            <div className="flex justify-between font-extrabold text-sm border-t border-border mt-2 pt-2">
              <span>Total</span>
              <span>{fmt(Number(pedido.valor_total))}</span>
            </div>
          </div>

          <Link
            to="/"
            className="block text-center bg-accent text-ink font-bold text-sm rounded-lg py-2.5 mt-5"
          >
            Voltar ao início
          </Link>
        </div>
      )}
    </ColabFrame>
  );
}
