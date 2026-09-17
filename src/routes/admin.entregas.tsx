import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/f8/Toast";
import { useConfirm } from "@/components/f8/ConfirmDialog";
import { fmt, horaFmt } from "@/lib/f8/format";
import { exportarPlanilha } from "@/lib/f8/exportar";
import type { ItemPedido, Pedido } from "@/lib/f8/types";

export const Route = createFileRoute("/admin/entregas")({
  component: Entregas,
});

type Linha = Pedido & {
  itens_pedido: ItemPedido[];
  profiles?: {
    nome_completo: string;
    codigo: string;
    empresa: string | null;
    departamentos?: { nome: string } | null;
  } | null;
};

function Entregas() {
  const { mostrar } = useToast();
  const { pedirConfirmacao, dialog } = useConfirm();
  const [pendentes, setPendentes] = useState<Linha[]>([]);
  const [entregues, setEntregues] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const hoje = new Date().toISOString().slice(0, 10);
  const [de, setDe] = useState(hoje);
  const [ate, setAte] = useState(hoje);
  const [departamento, setDepartamento] = useState("");
  const [departamentos, setDepartamentos] = useState<{ id: string; nome: string }[]>([]);

  const carregar = useCallback(async () => {
    const select =
      "*, itens_pedido(*), profiles!pedidos_colaborador_id_fkey(nome_completo, codigo, empresa, departamentos(nome))";
    const fimData = ate && ate >= de ? ate : de;
    const inicio = new Date(`${de}T00:00:00`).toISOString();
    const fim = new Date(`${fimData}T23:59:59`).toISOString();
    const [{ data: pend }, { data: entr }] = await Promise.all([
      supabase
        .from("pedidos")
        .select(select)
        .eq("status", "pendente")
        .order("criado_em", { ascending: true }),
      supabase
        .from("pedidos")
        .select(select)
        .eq("status", "entregue")
        .gte("criado_em", inicio)
        .lte("criado_em", fim)
        .order("entregue_em", { ascending: false }),
    ]);
    setPendentes((pend ?? []) as unknown as Linha[]);
    setEntregues((entr ?? []) as unknown as Linha[]);
    setCarregando(false);
  }, [de, ate]);

  useEffect(() => {
    carregar();
    const canal = supabase
      .channel("admin-pedidos")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregar]);

  useEffect(() => {
    supabase
      .from("departamentos")
      .select("id, nome")
      .order("nome")
      .then(({ data }) => setDepartamentos(data ?? []));
  }, []);

  const porDepartamento = (l: Linha) =>
    !departamento || (l.profiles?.departamentos?.nome ?? "") === departamento;
  const pendentesVis = pendentes.filter(porDepartamento);
  const entreguesVis = entregues.filter(porDepartamento);

  async function entregar(pedido: Linha) {
    const { error } = await supabase
      .from("pedidos")
      .update({ status: "entregue", entregue_em: new Date().toISOString() })
      .eq("id", pedido.id);
    if (error) mostrar(error.message, "danger");
    else {
      mostrar(`Entrega confirmada para ${pedido.profiles?.nome_completo ?? "colaborador"}.`);
      carregar();
    }
  }

  function cancelar(pedido: Linha) {
    pedirConfirmacao(
      "Cancelar este pedido? O estoque dos itens volta automaticamente. Essa ação não pode ser desfeita.",
      async () => {
        const { error } = await supabase.rpc("cancelar_pedido", {
          p_pedido_id: pedido.id,
          p_motivo: "Cancelado pela administração",
        });
        if (error) mostrar(error.message, "danger");
        else {
          mostrar("Pedido cancelado. Estoque devolvido.");
          carregar();
        }
      },
    );
  }

  function cartao(p: Linha, acionavel: boolean) {
    const itens = (p.itens_pedido ?? [])
      .map((i) => `${i.quantidade}x ${i.nome_produto}`)
      .join(", ");
    return (
      <div
        key={p.id}
        className="border border-border rounded-xl p-4 flex items-start justify-between gap-4 bg-card"
      >
        <div>
          <p className="font-semibold text-sm">
            {p.profiles?.nome_completo ?? "—"}{" "}
            <span className="text-muted-foreground font-normal">
              · {p.profiles?.empresa ?? "Grupo F8"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">{itens}</p>
          <p className="text-[11px] text-muted-foreground/80 mt-1">
            {horaFmt(p.criado_em)} · código {p.codigo_retirada} · {fmt(Number(p.valor_total))}
          </p>
        </div>
        {acionavel ? (
          <div className="shrink-0 flex flex-col gap-1.5 items-stretch">
            <button
              onClick={() => entregar(p)}
              className="bg-accent text-ink text-xs font-bold rounded-lg px-3 py-2"
            >
              Confirmar entrega
            </button>
            <button
              onClick={() => cancelar(p)}
              className="text-[11px] font-semibold text-danger"
            >
              Cancelar pedido
            </button>
          </div>
        ) : (
          <span className="shrink-0 bg-success/10 text-success text-[11px] font-bold rounded-full px-2.5 py-1">
            Entregue
          </span>
        )}
      </div>
    );
  }

  async function exportar() {
    const linhas = [...pendentesVis, ...entreguesVis].flatMap((p) =>
      (p.itens_pedido ?? []).map((i) => ({
        Colaborador: p.profiles?.nome_completo ?? "—",
        "Código do colaborador": p.profiles?.codigo ?? "—",
        Departamento: p.profiles?.departamentos?.nome ?? "—",
        Empresa: p.profiles?.empresa ?? "Grupo F8",
        "Código de retirada": p.codigo_retirada,
        Produto: i.nome_produto,
        Quantidade: i.quantidade,
        "Preço unitário": Number(i.preco_unitario),
        "Total do item": Number(i.preco_unitario) * i.quantidade,
        "Valor do pedido": Number(p.valor_total),
        Status: p.status,
        "Pedido em": horaFmt(p.criado_em),
        "Entregue em": p.entregue_em ? horaFmt(p.entregue_em) : "—",
      })),
    );
    await exportarPlanilha(`entregas-f8-${de}_a_${ate}`, [{ nome: "Entregas", linhas }]);
  }

  if (carregando) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <div>
      {dialog}
      <div className="mb-4 grid gap-2 sm:grid-cols-4 sm:items-center">
        <input
          type="date"
          aria-label="Data inicial"
          value={de}
          onChange={(e) => setDe(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card w-full"
        />
        <input
          type="date"
          aria-label="Data final"
          value={ate}
          onChange={(e) => setAte(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card w-full"
        />
        <select
          value={departamento}
          onChange={(e) => setDepartamento(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card w-full"
        >
          <option value="">Todos os departamentos</option>
          {departamentos.map((d) => (
            <option key={d.id} value={d.nome}>
              {d.nome}
            </option>
          ))}
        </select>
        <button
          onClick={exportar}
          className="text-xs font-semibold text-ink border border-border rounded-lg px-3 py-2.5 bg-card w-full"
        >
          Exportar entregas (Excel)
        </button>
      </div>
      <div className="mb-8">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3">
          Pendentes de retirada ({pendentesVis.length})
        </h3>
        {pendentesVis.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
            Nenhum pedido pendente no momento.
          </div>
        ) : (
          <div className="flex flex-col gap-3">{pendentesVis.map((p) => cartao(p, true))}</div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3">
          Entregas realizadas no período ({entreguesVis.length})
        </h3>
        {entreguesVis.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
            Nenhuma entrega registrada neste período.
          </div>
        ) : (
          <div className="flex flex-col gap-3">{entreguesVis.map((p) => cartao(p, false))}</div>
        )}
      </div>
    </div>
  );
}
