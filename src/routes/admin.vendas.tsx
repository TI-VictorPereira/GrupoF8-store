import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fmt, horaFmt } from "@/lib/f8/format";
import { exportarPlanilha } from "@/lib/f8/exportar";
import type { ItemPedido, Pedido } from "@/lib/f8/types";

export const Route = createFileRoute("/admin/vendas")({
  component: Vendas,
});

type Linha = Pedido & {
  itens_pedido: ItemPedido[];
  profiles?: {
    nome_completo: string;
    codigo: string;
    matricula?: string | null;
    empresa: string | null;
    departamentos?: { nome: string } | null;
  } | null;
};

const PERIODOS: { valor: string; rotulo: string; dias: number | null }[] = [
  { valor: "todos", rotulo: "Período: Todos", dias: null },
  { valor: "hoje", rotulo: "Últimas 24 horas", dias: 1 },
  { valor: "7dias", rotulo: "Últimos 7 dias", dias: 7 },
  { valor: "30dias", rotulo: "Últimos 30 dias", dias: 30 },
  { valor: "personalizado", rotulo: "Datas escolhidas", dias: null },
];

function Vendas() {
  const [periodo, setPeriodo] = useState("30dias");
  const hoje = new Date().toISOString().slice(0, 10);
  const [de, setDe] = useState(hoje);
  const [ate, setAte] = useState(hoje);
  const [departamento, setDepartamento] = useState("");
  const [departamentos, setDepartamentos] = useState<{ id: string; nome: string }[]>([]);
  const [todas, setTodas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);

  const intervalo = useCallback(() => {
    const dias = PERIODOS.find((p) => p.valor === periodo)?.dias ?? null;
    if (periodo === "personalizado") {
      const fimData = ate && ate >= de ? ate : de;
      return {
        inicio: new Date(`${de}T00:00:00`).toISOString(),
        fim: new Date(`${fimData}T23:59:59`).toISOString(),
      };
    }
    if (dias) {
      return {
        inicio: new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString(),
        fim: null as string | null,
      };
    }
    return { inicio: null as string | null, fim: null as string | null };
  }, [periodo, de, ate]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    let consulta = supabase
      .from("pedidos")
      .select(
        "*, itens_pedido(*), profiles!pedidos_colaborador_id_fkey(nome_completo, codigo, matricula, empresa, departamentos(nome))",
      )
      .neq("status", "cancelado")
      .order("criado_em", { ascending: false });
    const { inicio, fim } = intervalo();
    if (inicio) consulta = consulta.gte("criado_em", inicio);
    if (fim) consulta = consulta.lte("criado_em", fim);
    const { data } = await consulta;
    setTodas((data ?? []) as unknown as Linha[]);
    setCarregando(false);
  }, [intervalo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    supabase
      .from("departamentos")
      .select("id, nome")
      .order("nome")
      .then(({ data }) => setDepartamentos(data ?? []));
  }, []);

  const linhas = useMemo(
    () =>
      todas.filter(
        (l) => !departamento || (l.profiles?.departamentos?.nome ?? "") === departamento,
      ),
    [todas, departamento],
  );

  const r = useMemo(() => {
    let receita = 0;
    let custo = 0;
    const porProduto = new Map<string, { qtd: number; receita: number; custo: number }>();
    for (const pedido of linhas) {
      for (const item of pedido.itens_pedido ?? []) {
        const recItem = Number(item.preco_unitario) * item.quantidade;
        const custoItem = Number(item.custo_unitario) * item.quantidade;
        receita += recItem;
        custo += custoItem;
        const atual = porProduto.get(item.nome_produto) ?? { qtd: 0, receita: 0, custo: 0 };
        atual.qtd += item.quantidade;
        atual.receita += recItem;
        atual.custo += custoItem;
        porProduto.set(item.nome_produto, atual);
      }
    }
    const ranking = [...porProduto.entries()].sort((a, b) => b[1].qtd - a[1].qtd);
    const lucro = receita - custo;
    return {
      receita,
      custo,
      lucro,
      margem: receita ? (lucro / receita) * 100 : 0,
      pedidos: linhas.length,
      ticket: linhas.length ? receita / linhas.length : 0,
      maisVendido: ranking[0]?.[0] ?? "—",
      ranking,
    };
  }, [linhas]);

  async function exportar() {
    const detalhado = linhas.flatMap((p) =>
      (p.itens_pedido ?? []).map((item) => ({
        Data: horaFmt(p.criado_em),
        Colaborador: p.profiles?.nome_completo ?? "—",
        "Código do colaborador": p.profiles?.codigo ?? "—",
        Departamento: p.profiles?.departamentos?.nome ?? "—",
        Empresa: p.profiles?.empresa ?? "Grupo F8",
        "Código de retirada": p.codigo_retirada,
        Produto: item.nome_produto,
        Categoria: item.categoria ?? "—",
        Quantidade: item.quantidade,
        "Preço unitário": Number(item.preco_unitario),
        "Custo unitário": Number(item.custo_unitario),
        "Total do item": Number(item.preco_unitario) * item.quantidade,
        "Lucro do item":
          (Number(item.preco_unitario) - Number(item.custo_unitario)) * item.quantidade,
        Status: p.status,
      })),
    );
    const porProduto = r.ranking.map(([nome, d]) => ({
      Produto: nome,
      Unidades: d.qtd,
      Receita: d.receita,
      Custo: d.custo,
      Lucro: d.receita - d.custo,
      "Margem %": d.receita ? Number((((d.receita - d.custo) / d.receita) * 100).toFixed(1)) : 0,
    }));
    const sufixo = periodo === "personalizado" ? `${de}_a_${ate}` : periodo;
    await exportarPlanilha(`vendas-f8-${sufixo}`, [
      { nome: "Vendas", linhas: detalhado },
      { nome: "Por produto", linhas: porProduto },
    ]);
  }

  async function exportarPorColaborador() {
    const { inicio, fim } = intervalo();
    let cAlmocos = supabase
      .from("almocos")
      .select(
        "id, criado_em, status, origem, profiles!almocos_colaborador_id_fkey(nome_completo, codigo, matricula, empresa, departamentos(nome))",
      )
      .eq("status", "confirmado")
      .order("criado_em", { ascending: false });
    if (inicio) cAlmocos = cAlmocos.gte("criado_em", inicio);
    if (fim) cAlmocos = cAlmocos.lte("criado_em", fim);
    const { data: almocos } = await cAlmocos;

    type Perfil = NonNullable<Linha["profiles"]>;
    const base = (p?: Perfil | null) => ({
      Código: p?.codigo ?? "—",
      Matrícula: p?.matricula ?? "—",
      Empresa: p?.empresa ?? "Grupo F8",
      Colaborador: p?.nome_completo ?? "—",
      Departamento: p?.departamentos?.nome ?? "—",
    });

    const consumo = [
      ...linhas.flatMap((p) =>
        (p.itens_pedido ?? []).map((item) => ({
          ...base(p.profiles),
          Data: horaFmt(p.criado_em),
          Tipo: "Compra na loja",
          Item: item.nome_produto,
          Categoria: item.categoria ?? "—",
          Quantidade: item.quantidade,
          "Valor unitário": Number(item.preco_unitario),
          "Valor total": Number(item.preco_unitario) * item.quantidade,
          "Código de retirada": p.codigo_retirada,
          Status: p.status,
        })),
      ),
      ...((almocos ?? []) as unknown as {
        id: string;
        criado_em: string;
        status: string;
        origem: string;
        profiles?: Perfil | null;
      }[]).map((a) => ({
        ...base(a.profiles),
        Data: horaFmt(a.criado_em),
        Tipo: "Almoço",
        Item: "Almoço no refeitório",
        Categoria: a.origem === "manual" ? "Registro manual" : "Totem",
        Quantidade: 1,
        "Valor unitário": 0,
        "Valor total": 0,
        "Código de retirada": "—",
        Status: a.status,
      })),
    ].sort((a, b) => a.Colaborador.localeCompare(b.Colaborador));

    const totais = new Map<
      string,
      ReturnType<typeof base> & { itens: number; compras: number; almocos: number; valor: number }
    >();
    for (const p of linhas) {
      const chave = p.profiles?.codigo ?? p.colaborador_id;
      const atual = totais.get(chave) ?? {
        ...base(p.profiles),
        itens: 0,
        compras: 0,
        almocos: 0,
        valor: 0,
      };
      atual.compras += 1;
      for (const item of p.itens_pedido ?? []) {
        atual.itens += item.quantidade;
        atual.valor += Number(item.preco_unitario) * item.quantidade;
      }
      totais.set(chave, atual);
    }
    for (const a of (almocos ?? []) as unknown as { profiles?: Perfil | null }[]) {
      const chave = a.profiles?.codigo ?? "—";
      const atual = totais.get(chave) ?? {
        ...base(a.profiles),
        itens: 0,
        compras: 0,
        almocos: 0,
        valor: 0,
      };
      atual.almocos += 1;
      totais.set(chave, atual);
    }

    const resumo = [...totais.values()]
      .sort((a, b) => b.valor - a.valor)
      .map((t) => ({
        Código: t.Código,
        Matrícula: t.Matrícula,
        Empresa: t.Empresa,
        Colaborador: t.Colaborador,
        Departamento: t.Departamento,
        "Compras realizadas": t.compras,
        "Itens comprados": t.itens,
        "Almoços confirmados": t.almocos,
        "Valor total": t.valor,
      }));

    const sufixo = periodo === "personalizado" ? `${de}_a_${ate}` : periodo;
    await exportarPlanilha(`consumo-por-colaborador-f8-${sufixo}`, [
      { nome: "Consumo detalhado", linhas: consumo },
      { nome: "Total por colaborador", linhas: resumo },
    ]);
  }

  const maxQtd = r.ranking[0]?.[1].qtd ?? 1;

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-4 sm:items-center mb-6">
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card w-full"
        >
          {PERIODOS.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.rotulo}
            </option>
          ))}
        </select>
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
        {periodo === "personalizado" && (
          <>
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
          </>
        )}
        <button
          onClick={exportar}
          className="text-xs font-semibold text-ink border border-border rounded-lg px-3 py-2.5 bg-card w-full"
        >
          Exportar este recorte (Excel)
        </button>
        <button
          onClick={exportarPorColaborador}
          className="text-xs font-semibold text-ink border border-border rounded-lg px-3 py-2.5 bg-accent w-full"
        >
          Exportar consumo por colaborador (Excel)
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4">
        {[
          { rotulo: "Receita total", valor: fmt(r.receita), cor: "" },
          { rotulo: "Custo total", valor: fmt(r.custo), cor: "" },
          { rotulo: "Lucro total", valor: fmt(r.lucro), cor: "text-success" },
          { rotulo: "Margem", valor: `${r.margem.toFixed(1)}%`, cor: "" },
        ].map((c) => (
          <div key={c.rotulo} className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs text-muted-foreground font-medium">{c.rotulo}</p>
            <p className={"text-2xl font-bold mt-2 " + c.cor}>{c.valor}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted-foreground font-medium">Pedidos liberados</p>
          <p className="text-2xl font-bold mt-2">{r.pedidos}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted-foreground font-medium">Ticket médio</p>
          <p className="text-2xl font-bold mt-2">{fmt(r.ticket)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted-foreground font-medium">Item mais vendido</p>
          <p className="text-lg font-bold mt-2 leading-tight">{r.maisVendido}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 sm:p-6 mb-6">
        <h3 className="text-sm font-bold mb-4">Quantidade vendida por item</h3>
        {r.ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma venda no período selecionado.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {r.ranking.slice(0, 10).map(([nome, d]) => (
              <div key={nome} className="flex items-center gap-3">
                <span className="text-xs w-24 sm:w-40 shrink-0 truncate">{nome}</span>
                <div className="flex-1 bg-bg rounded h-6 overflow-hidden">
                  <div
                    className="h-6 bg-accent rounded"
                    style={{ width: `${Math.max(6, (d.qtd / maxQtd) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-semibold w-8 text-right">{d.qtd}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-4 sm:p-6 mb-6">
        <h3 className="text-sm font-bold mb-4">Custo e lucro por produto</h3>

        {/* Cartões — celular */}
        <div className="md:hidden flex flex-col gap-3">
          {r.ranking.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhuma venda no período selecionado.
            </p>
          ) : (
            r.ranking.map(([nome, d]) => {
              const lucro = d.receita - d.custo;
              return (
                <div key={nome} className="border border-border rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm truncate">{nome}</p>
                    <span className="text-xs font-bold text-ink bg-bg rounded-full px-2 py-0.5 shrink-0">
                      {d.qtd} un
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Receita</p>
                      <p className="text-xs font-semibold">{fmt(d.receita)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Custo</p>
                      <p className="text-xs font-semibold">{fmt(d.custo)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Lucro</p>
                      <p className="text-xs font-semibold text-success">{fmt(lucro)}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Tabela — desktop */}
        <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm admin-table">
          <thead>
            <tr className="text-left border-b border-border">
              <th className="py-2 pr-3">Produto</th>
              <th className="py-2 pr-3">Unidades</th>
              <th className="py-2 pr-3">Receita</th>
              <th className="py-2 pr-3">Custo</th>
              <th className="py-2 pr-3">Lucro</th>
              <th className="py-2">Margem</th>
            </tr>
          </thead>
          <tbody>
            {r.ranking.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  Nenhuma venda no período selecionado.
                </td>
              </tr>
            ) : (
              r.ranking.map(([nome, d]) => {
                const lucro = d.receita - d.custo;
                return (
                  <tr key={nome} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3 font-semibold">{nome}</td>
                    <td className="py-2.5 pr-3">{d.qtd}</td>
                    <td className="py-2.5 pr-3">{fmt(d.receita)}</td>
                    <td className="py-2.5 pr-3">{fmt(d.custo)}</td>
                    <td className="py-2.5 pr-3 text-success font-semibold">{fmt(lucro)}</td>
                    <td className="py-2.5">
                      {(d.receita ? (lucro / d.receita) * 100 : 0).toFixed(1)}%
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 sm:p-6">
        <h3 className="text-sm font-bold mb-4">Pedidos recentes</h3>

        {/* Cartões — celular */}
        <div className="md:hidden flex flex-col gap-3">
          {carregando ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : linhas.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhuma venda registrada ainda.
            </p>
          ) : (
            linhas.slice(0, 8).map((p) => (
              <div key={p.id} className="border border-border rounded-xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm truncate">
                    {p.profiles?.nome_completo ?? "—"}
                  </p>
                  <p className="text-sm font-bold shrink-0">{fmt(Number(p.valor_total))}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {(p.itens_pedido ?? [])
                    .map((i) => `${i.quantidade}x ${i.nome_produto}`)
                    .join(", ")}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">{horaFmt(p.criado_em)}</p>
              </div>
            ))
          )}
        </div>

        {/* Tabela — desktop */}
        <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm admin-table">
          <thead>
            <tr className="text-left border-b border-border">
              <th className="py-2 pr-3">Colaborador</th>
              <th className="py-2 pr-3">Itens</th>
              <th className="py-2 pr-3">Valor</th>
              <th className="py-2">Data</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            ) : linhas.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted-foreground">
                  Nenhuma venda registrada ainda.
                </td>
              </tr>
            ) : (
              linhas.slice(0, 8).map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 pr-3">{p.profiles?.nome_completo ?? "—"}</td>
                  <td className="py-2.5 pr-3 text-muted-foreground">
                    {(p.itens_pedido ?? [])
                      .map((i) => `${i.quantidade}x ${i.nome_produto}`)
                      .join(", ")}
                  </td>
                  <td className="py-2.5 pr-3 font-semibold">{fmt(Number(p.valor_total))}</td>
                  <td className="py-2.5 text-muted-foreground">{horaFmt(p.criado_em)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
