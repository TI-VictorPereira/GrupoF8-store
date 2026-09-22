import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { Cabecalho } from "@/componentes/Cabecalho";
import { Carregando } from "@/componentes/Carregando";
import { IconeCategoria } from "@/componentes/IconeCategoria";
import { Moldura } from "@/componentes/Moldura";
import { Vazio } from "@/componentes/Vazio";
import { Button } from "@/componentes/ui/button";
import { Card } from "@/componentes/ui/card";
import { ESTILO_CATEGORIA, chaveCategoria } from "@/comum/categorias";
import { mensagemDeErro } from "@/comum/erros";
import { dinheiro } from "@/comum/formato";
import { GRADE_PRODUTOS, PAGINA_APP } from "@/comum/layout";
import { cn } from "@/comum/utilitarios";
import type { Categoria, PedidoCriado, ProdutoVitrine } from "@/interfaces/loja";


const AVISOS: Record<string, string> = {
  estoque_insuficiente: "Alguém levou o último antes de você. Ajuste a quantidade.",
  produto_indisponivel: "Este produto saiu da loja.",
};

export function Loja() {
  const navegar = useNavigate();
  const clienteConsulta = useQueryClient();
  const [filtro, setFiltro] = useState<string>("todas");
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});

  const produtos = useQuery({
    queryKey: ["vitrine"],
    queryFn: () => api.get<ProdutoVitrine[]>("/produtos/vitrine"),
  });
  const categorias = useQuery({
    queryKey: ["categorias"],
    queryFn: () => api.get<Categoria[]>("/produtos/categorias"),
  });

  const finalizar = useMutation({
    mutationFn: () =>
      api.post<PedidoCriado>("/pedidos", {
        itens: Object.entries(carrinho).map(([produto_id, quantidade]) => ({
          produto_id,
          quantidade,
        })),
      }),
    onSuccess: (pedido) => {
      void clienteConsulta.invalidateQueries({ queryKey: ["vitrine"] });
      void navegar({ to: "/pedido/$pedidoId", params: { pedidoId: pedido.id } });
    },
  });

  const visiveis = useMemo(() => {
    const lista = produtos.data ?? [];
    return filtro === "todas" ? lista : lista.filter((p) => p.categoria_id === filtro);
  }, [produtos.data, filtro]);

  const total = useMemo(
    () =>
      Object.entries(carrinho).reduce((soma, [id, qtd]) => {
        const produto = produtos.data?.find((p) => p.id === id);
        return soma + (produto ? Number(produto.preco_venda) * qtd : 0);
      }, 0),
    [carrinho, produtos.data],
  );
  const totalItens = Object.values(carrinho).reduce((a, b) => a + b, 0);

  function alterar(produto: ProdutoVitrine, delta: number) {
    setCarrinho((atual) => {
      const novo = { ...atual };
      const quantidade = (novo[produto.id] ?? 0) + delta;
      if (quantidade <= 0) delete novo[produto.id];
      else if (quantidade > produto.estoque) return atual;
      else novo[produto.id] = quantidade;
      return novo;
    });
  }

  const nomeCategoria = useMemo(() => {
    const mapa = new Map((categorias.data ?? []).map((c) => [c.id, c.nome]));
    return (id: string | null) => (id ? (mapa.get(id) ?? "") : "");
  }, [categorias.data]);
  const categoriaDe = (produto: ProdutoVitrine) =>
    chaveCategoria(nomeCategoria(produto.categoria_id));

  const aviso = finalizar.error ? mensagemDeErro(finalizar.error, AVISOS) : null;

  return (
    <Moldura>
      <Cabecalho titulo="Loja interna" />

      <div className={cn(PAGINA_APP, "pt-4")}>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {[{ id: "todas", nome: "Todos" }, ...(categorias.data ?? [])].map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={filtro === c.id ? "default" : "outline"}
              onClick={() => setFiltro(c.id)}
              className="shrink-0 rounded-full text-[11px]"
            >
              {c.nome}
            </Button>
          ))}
        </div>
      </div>

      <div className={cn(PAGINA_APP, "py-5 pb-28")}>
        {produtos.isLoading && <Carregando texto="Carregando produtos…" />}
        {aviso && (
          <div className="mb-3">
            <Aviso>{aviso}</Aviso>
          </div>
        )}
        {produtos.data && visiveis.length === 0 && <Vazio>Nada nesta categoria.</Vazio>}

        <div className={GRADE_PRODUTOS}>
          {visiveis.map((produto) => {
            const quantidade = carrinho[produto.id] ?? 0;
            const semEstoque = produto.estoque <= 0;
            return (
              <Card key={produto.id} className="overflow-hidden">
                <div
                  className="flex h-24 items-center justify-center"
                  style={
                    produto.foto_url
                      ? undefined
                      : { backgroundColor: ESTILO_CATEGORIA[categoriaDe(produto)].bg }
                  }
                >
                  {produto.foto_url ? (
                    <img
                      src={produto.foto_url}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span style={{ color: ESTILO_CATEGORIA[categoriaDe(produto)].fg }}>
                      <IconeCategoria cat={categoriaDe(produto)} size={34} />
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="text-[13px] leading-tight font-semibold">{produto.nome}</p>
                  <p className="mt-0.5 text-[11px] text-muito-suave">
                    {semEstoque ? "Sem estoque" : `${produto.estoque} disponíveis`}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[13px] font-extrabold">
                      {dinheiro(produto.preco_venda)}
                    </span>
                    {quantidade === 0 ? (
                      <Button
                        size="sm"
                        variant="destaque"
                        disabled={semEstoque}
                        onClick={() => alterar(produto, 1)}
                        className="h-7 px-2.5 text-[11px]"
                      >
                        Add
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => alterar(produto, -1)}
                          aria-label="Menos um"
                          className="h-6 w-6"
                        >
                          <Minus />
                        </Button>
                        <span className="w-4 text-center text-[13px] font-bold">
                          {quantidade}
                        </span>
                        <Button
                          size="icon"
                          variant="destaque"
                          onClick={() => alterar(produto, 1)}
                          disabled={quantidade >= produto.estoque}
                          aria-label="Mais um"
                          className="h-6 w-6"
                        >
                          <Plus />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {totalItens > 0 && (
        <div
          className={cn(
            PAGINA_APP,
            "fixed inset-x-0 bottom-0 flex items-center gap-3 border-t border-borda bg-card py-3",
          )}
        >
          <div className="flex-1">
            <p className="text-[11px] text-suave">
              {totalItens} {totalItens === 1 ? "item" : "itens"}
            </p>
            <p className="text-sm font-extrabold">{dinheiro(total)}</p>
          </div>
          <Button
            onClick={() => finalizar.mutate()}
            disabled={finalizar.isPending}
            className="rounded-xl px-5"
          >
            {finalizar.isPending ? "Finalizando…" : "Finalizar"}
          </Button>
        </div>
      )}
    </Moldura>
  );
}
