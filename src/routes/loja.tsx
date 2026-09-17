import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Protegido } from "@/components/f8/Protegido";
import { ColabFrame, ColabSubHeader } from "@/components/f8/ColabShell";
import { useToast } from "@/components/f8/Toast";
import { fmt } from "@/lib/f8/format";
import { chaveCategoria, ESTILO_CATEGORIA, IconeCategoria } from "@/lib/f8/categorias";
import type { CategoriaProduto, Produto } from "@/lib/f8/types";

export const Route = createFileRoute("/loja")({
  head: () => ({
    meta: [
      { title: "Loja — Loja Interna F8" },
      { name: "description", content: "Bebidas e picolés disponíveis para os colaboradores F8." },
      { property: "og:title", content: "Loja — Loja Interna F8" },
      {
        property: "og:description",
        content: "Bebidas e picolés disponíveis para os colaboradores F8.",
      },
    ],
  }),
  component: () => (
    <Protegido papeis={["colaborador", "admin", "refeitorio"]}>
      <Loja />
    </Protegido>
  ),
});

function Loja() {
  const navigate = useNavigate();
  const { mostrar } = useToast();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<CategoriaProduto[]>([]);
  const [filtro, setFiltro] = useState<string>("todas");
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: prods }, { data: cats }] = await Promise.all([
        supabase.from("produtos").select("*").eq("ativo", true).order("nome"),
        supabase.from("categorias_produto").select("*").order("nome"),
      ]);
      setProdutos((prods ?? []) as Produto[]);
      setCategorias((cats ?? []) as CategoriaProduto[]);
      setCarregando(false);
    })();
  }, []);

  const nomeCategoria = useMemo(() => {
    const mapa: Record<string, string> = {};
    categorias.forEach((c) => (mapa[c.id] = c.nome));
    return mapa;
  }, [categorias]);

  const visiveis = useMemo(
    () => (filtro === "todas" ? produtos : produtos.filter((p) => p.categoria_id === filtro)),
    [produtos, filtro],
  );

  const total = useMemo(
    () =>
      Object.entries(carrinho).reduce((soma, [id, qtd]) => {
        const p = produtos.find((x) => x.id === id);
        return soma + (p ? Number(p.preco_venda) * qtd : 0);
      }, 0),
    [carrinho, produtos],
  );

  const totalItens = Object.values(carrinho).reduce((a, b) => a + b, 0);

  function alterar(produto: Produto, delta: number) {
    setCarrinho((atual) => {
      const novo = { ...atual };
      const qtd = (novo[produto.id] ?? 0) + delta;
      if (qtd <= 0) delete novo[produto.id];
      else if (qtd > produto.estoque) {
        mostrar("Quantidade acima do estoque disponível.", "danger");
        return atual;
      } else novo[produto.id] = qtd;
      return novo;
    });
  }

  async function finalizar() {
    if (totalItens === 0) return;
    setEnviando(true);
    const itens = Object.entries(carrinho).map(([produto_id, quantidade]) => ({
      produto_id,
      quantidade,
    }));
    const { data, error } = await supabase.rpc("finalizar_pedido", { p_itens: itens });
    setEnviando(false);

    if (error || !data) {
      mostrar(error?.message ?? "Não foi possível finalizar o pedido.", "danger");
      return;
    }
    const pedido = Array.isArray(data) ? data[0] : data;
    navigate({ to: "/loja/sucesso/$pedidoId", params: { pedidoId: pedido.id } });
  }

  return (
    <ColabFrame>
      <ColabSubHeader titulo="Loja interna" />

      <div className="px-5 pt-4 flex gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setFiltro("todas")}
          className={
            "text-[11px] font-semibold px-3 py-1.5 rounded-full border whitespace-nowrap " +
            (filtro === "todas"
              ? "bg-ink text-bg border-ink"
              : "bg-card border-border text-muted-foreground")
          }
        >
          Todos
        </button>
        {categorias.map((c) => (
          <button
            key={c.id}
            onClick={() => setFiltro(c.id)}
            className={
              "text-[11px] font-semibold px-3 py-1.5 rounded-full border whitespace-nowrap " +
              (filtro === c.id
                ? "bg-ink text-bg border-ink"
                : "bg-card border-border text-muted-foreground")
            }
          >
            {c.nome}
          </button>
        ))}
      </div>

      {carregando ? (
        <p className="p-5 text-sm text-muted-foreground">Carregando produtos…</p>
      ) : (
        <div className="p-5 grid grid-cols-2 gap-3">
          {visiveis.map((p) => {
            const qtd = carrinho[p.id] ?? 0;
            const semEstoque = p.estoque <= 0;
            const chave = chaveCategoria(p.categoria_id ? nomeCategoria[p.categoria_id] : null);
            const estilo = ESTILO_CATEGORIA[chave];
            return (
              <div key={p.id} className="border border-border rounded-xl overflow-hidden">
                <div
                  className="h-24 flex items-center justify-center"
                  style={{ background: estilo.bg, color: estilo.fg }}
                >
                  {p.foto_url ? (
                    <img
                      src={p.foto_url}
                      alt={p.nome}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <IconeCategoria cat={chave} size={30} />
                  )}
                </div>
                <div className="p-2.5">
                  <p className="text-[13px] font-semibold leading-tight">{p.nome}</p>
                  <p className="text-[11px] text-muted-soft mt-0.5">
                    {semEstoque ? (
                      <span className="low-stock">Sem estoque</span>
                    ) : (
                      `${p.estoque} disponíveis`
                    )}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[13px] font-extrabold">{fmt(Number(p.preco_venda))}</span>
                    {qtd === 0 ? (
                      <button
                        disabled={semEstoque}
                        onClick={() => alterar(p, 1)}
                        className="text-[11px] font-bold bg-accent text-ink rounded-lg px-2.5 py-1.5 disabled:opacity-40"
                      >
                        Add
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => alterar(p, -1)}
                          className="qty-btn border border-border font-bold"
                        >
                          −
                        </button>
                        <span className="text-[13px] font-bold w-4 text-center">{qtd}</span>
                        <button
                          onClick={() => alterar(p, 1)}
                          className="qty-btn bg-accent text-ink font-bold"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalItens > 0 && (
        <div className="sticky bottom-0 bg-card border-t border-border px-5 py-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-[11px] text-muted-foreground">
              {totalItens} {totalItens === 1 ? "item" : "itens"}
            </p>
            <p className="font-extrabold text-sm">{fmt(total)}</p>
          </div>
          <button
            onClick={finalizar}
            disabled={enviando}
            className="bg-ink text-bg font-bold text-sm rounded-xl px-5 py-2.5 disabled:opacity-60"
          >
            {enviando ? "Finalizando…" : "Finalizar"}
          </button>
        </div>
      )}
    </ColabFrame>
  );
}
