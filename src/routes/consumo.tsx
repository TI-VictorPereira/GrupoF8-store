import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Protegido } from "@/components/f8/Protegido";
import { ColabFrame, ColabSubHeader } from "@/components/f8/ColabShell";
import { fmt, horaFmt } from "@/lib/f8/format";
import { useSession } from "@/lib/f8/session";
import type { Almoco, ItemPedido, Pedido } from "@/lib/f8/types";

export const Route = createFileRoute("/consumo")({
  head: () => ({
    meta: [
      { title: "Meu consumo — Loja Interna F8" },
      { name: "description", content: "Histórico de pedidos e gastos do colaborador no mês." },
      { property: "og:title", content: "Meu consumo — Loja Interna F8" },
      {
        property: "og:description",
        content: "Histórico de pedidos e gastos do colaborador no mês.",
      },
    ],
  }),
  component: () => (
    <Protegido papeis={["colaborador", "admin", "refeitorio"]}>
      <Consumo />
    </Protegido>
  ),
});

type PedidoComItens = Pedido & { itens_pedido: ItemPedido[] };
type Registro = { id: string; tipo: "loja" | "almoco"; data: string; label: string; valor: number | null };

function Consumo() {
  const { sessao } = useSession();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const id = sessao?.colaborador?.id;
    if (!id) return;
    (async () => {
      const [{ data: peds }, { data: alms }] = await Promise.all([
        supabase
          .from("pedidos")
          .select("*, itens_pedido(*)")
          .eq("colaborador_id", id)
          .order("criado_em", { ascending: false })
          .limit(40),
        supabase
          .from("almocos")
          .select("*")
          .eq("colaborador_id", id)
          .order("criado_em", { ascending: false })
          .limit(40),
      ]);

      const listaPedidos = ((peds ?? []) as unknown as PedidoComItens[]).map<Registro>((p) => ({
        id: p.id,
        tipo: "loja",
        data: p.criado_em,
        label: (p.itens_pedido ?? []).map((i) => `${i.quantidade}x ${i.nome_produto}`).join(", "),
        valor: Number(p.valor_total),
      }));
      const listaAlmocos = ((alms ?? []) as unknown as Almoco[]).map<Registro>((a) => ({
        id: a.id,
        tipo: "almoco",
        data: a.criado_em,
        label:
          a.status === "confirmado"
            ? "Confirmado no refeitório"
            : a.status === "pendente"
              ? "Aguardando confirmação"
              : a.status === "expirado"
                ? "Código expirado"
                : "Cancelado",
        valor: null,
      }));

      setRegistros(
        [...listaPedidos, ...listaAlmocos]
          .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
          .slice(0, 30),
      );
      setCarregando(false);
    })();
  }, [sessao]);

  return (
    <ColabFrame>
      <ColabSubHeader titulo="Meu consumo" />
      <div className="p-5">
        {carregando ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
        ) : registros.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhum consumo registrado ainda.
          </p>
        ) : (
          registros.map((r) => (
            <div
              key={r.tipo + r.id}
              className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">
                  {r.tipo === "loja" ? "Compra na loja" : "Almoço"}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {r.label} · {horaFmt(r.data)}
                </p>
              </div>
              {r.valor != null ? (
                <span className="text-sm font-bold shrink-0">{fmt(r.valor)}</span>
              ) : (
                <span className="text-[11px] text-muted-soft shrink-0">—</span>
              )}
            </div>
          ))
        )}
      </div>
    </ColabFrame>
  );
}
