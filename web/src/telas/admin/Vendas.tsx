import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Minus, Plus, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { Carregando } from "@/componentes/Carregando";
import { TableHeadOrdenavel } from "@/componentes/TableHeadOrdenavel";
import { Vazio } from "@/componentes/Vazio";
import { Badge } from "@/componentes/ui/badge";
import { Button } from "@/componentes/ui/button";
import { Card, CardContent } from "@/componentes/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/componentes/ui/dialog";
import { Input } from "@/componentes/ui/input";
import { Label } from "@/componentes/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/componentes/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/componentes/ui/tabs";
import { mensagemDeErro } from "@/comum/erros";
import { FiltroPeriodo } from "@/componentes/FiltroPeriodo";
import { dataHora, dinheiro } from "@/comum/formato";
import { ordenar, useOrdenacao } from "@/comum/ordenacao";
import { intervaloDoFiltro, periodoInicial } from "@/comum/periodo";
import type { PedidoCompleto, LinhaPedido } from "@/interfaces/admin";
import type { LinhaPainel } from "@/interfaces/refeitorio";
import type { ProdutoVitrine } from "@/interfaces/loja";

const AVISOS: Record<string, string> = {
  periodo_invalido: "A data final não pode ser anterior à inicial.",
  produto_indisponivel: "Este produto saiu da loja.",
  estoque_insuficiente: "Não há estoque suficiente para essa quantidade.",
  nome_obrigatorio: "O nome do visitante é obrigatório.",
  pix_nao_configurado: "Pix não configurado. Fale com o suporte.",
  pedido_nao_aguardando_pagamento: "Esta venda já foi tratada.",
  pedido_nao_pendente: "Esta venda já foi tratada.",
};

interface Totais {
  receita: number;
  custo: number;
  unidades: number;
}

interface LinhaProduto extends Totais {
  nome: string;
  lucro: number;
  margem: number;
}

type ColunaProduto = "nome" | "unidades" | "receita" | "custo" | "lucro" | "margem";

function valorOrdenavel(linha: LinhaProduto, coluna: ColunaProduto): string | number {
  return coluna === "nome" ? linha.nome.toLowerCase() : linha[coluna];
}

interface ItemCarrinhoVisitante {
  quantidade: number;
  cortesia: boolean;
}

function rotuloStatusVisitante(status: PedidoCompleto["status"]): string {
  if (status === "aguardando_pagamento") return "aguardando pix";
  if (status === "cancelado") return "cancelado";
  return "pago";
}

function corStatusVisitante(status: PedidoCompleto["status"]) {
  if (status === "aguardando_pagamento") return "outline" as const;
  if (status === "cancelado") return "destructive" as const;
  return "secondary" as const;
}

export function Vendas() {
  const clienteConsulta = useQueryClient();
  const [filtro, setFiltro] = useState(() => periodoInicial("ciclo"));
  const { de, ate } = intervaloDoFiltro(filtro);

  const [visitanteAberto, setVisitanteAberto] = useState(false);
  const [nomeVisitante, setNomeVisitante] = useState("");
  const [buscaProdutoVisitante, setBuscaProdutoVisitante] = useState("");
  const [carrinhoVisitante, setCarrinhoVisitante] = useState<
    Record<string, ItemCarrinhoVisitante>
  >({});
  const [vendaGerada, setVendaGerada] = useState<{
    pedido: PedidoCompleto;
    pix: { valor: string; txid: string; copia_cola: string; qr_code_base64: string } | null;
  } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [confirmarCortesiaAberto, setConfirmarCortesiaAberto] = useState(false);

  const vendas = useQuery({
    queryKey: ["vendas", de, ate],
    queryFn: () => api.get<LinhaPedido[]>(`/pedidos?de=${de}&ate=${ate}`),
  });
  const almocos = useQuery({
    queryKey: ["almocos-historico", de, ate],
    queryFn: () => api.get<LinhaPainel[]>(`/almocos?de=${de}&ate=${ate}`),
  });
  const produtosVisitante = useQuery({
    queryKey: ["produtos-vitrine-visitante"],
    queryFn: () => api.get<ProdutoVitrine[]>("/produtos/vitrine"),
    enabled: visitanteAberto && !vendaGerada,
  });
  const vendasVisitante = useQuery({
    queryKey: ["vendas-visitante", de, ate],
    queryFn: () => api.get<PedidoCompleto[]>(`/pedidos/visitante?de=${de}&ate=${ate}`),
  });

  const validos = useMemo(
    () => (vendas.data ?? []).filter((l) => l.pedido.status !== "cancelado"),
    [vendas.data],
  );

  const entregues = useMemo(
    () => (vendas.data ?? []).filter((l) => l.pedido.status === "entregue"),
    [vendas.data],
  );

  const totais = useMemo<Totais>(
    () =>
      validos.reduce(
        (acumulado, linha) => {
          for (const item of linha.pedido.itens) {
            acumulado.receita += Number(item.preco_unitario) * item.quantidade;
            acumulado.custo += Number(item.custo_unitario) * item.quantidade;
            acumulado.unidades += item.quantidade;
          }
          return acumulado;
        },
        { receita: 0, custo: 0, unidades: 0 },
      ),
    [validos],
  );

  const porProduto = useMemo<LinhaProduto[]>(() => {
    const mapa = new Map<string, Totais>();
    for (const linha of validos) {
      for (const item of linha.pedido.itens) {
        const atual = mapa.get(item.nome_produto) ?? { receita: 0, custo: 0, unidades: 0 };
        atual.receita += Number(item.preco_unitario) * item.quantidade;
        atual.custo += Number(item.custo_unitario) * item.quantidade;
        atual.unidades += item.quantidade;
        mapa.set(item.nome_produto, atual);
      }
    }
    return [...mapa.entries()].map(([nome, dados]) => {
      const lucro = dados.receita - dados.custo;
      return { nome, ...dados, lucro, margem: dados.receita ? (lucro / dados.receita) * 100 : 0 };
    });
  }, [validos]);

  const ordenacaoProduto = useOrdenacao<ColunaProduto>("receita", "desc");
  const produtosOrdenados = useMemo(
    () => ordenar(porProduto, ordenacaoProduto, valorOrdenavel),
    [porProduto, ordenacaoProduto],
  );

  const lucro = totais.receita - totais.custo;
  const margem = totais.receita ? (lucro / totais.receita) * 100 : 0;
  const almocosConfirmados = (almocos.data ?? []).filter(
    (l) => l.almoco.status === "confirmado",
  );

  const baixarDetalhado = useMutation({
    mutationFn: () =>
      api.baixar(
        `/relatorios/vendas-detalhado?de=${de}&ate=${ate}`,
        `vendas-detalhado-${de}_a_${ate}.xlsx`,
      ),
  });

  const baixarConsolidado = useMutation({
    mutationFn: () =>
      api.baixar(
        `/relatorios/vendas-consolidado?de=${de}&ate=${ate}`,
        `vendas-consolidado-${de}_a_${ate}.xlsx`,
      ),
  });

  function recarregarAposVendaVisitante() {
    void clienteConsulta.invalidateQueries({ queryKey: ["vendas-visitante"] });
    void clienteConsulta.invalidateQueries({ queryKey: ["produtos-admin"] });
    void clienteConsulta.invalidateQueries({ queryKey: ["vitrine"] });
    void clienteConsulta.invalidateQueries({ queryKey: ["produtos-vitrine-visitante"] });
  }

  function fecharVisitante() {
    setVisitanteAberto(false);
    setNomeVisitante("");
    setBuscaProdutoVisitante("");
    setCarrinhoVisitante({});
    setVendaGerada(null);
    setConfirmarCortesiaAberto(false);
  }

  const gerarVenda = useMutation({
    mutationFn: () =>
      api.post<{
        pedido: PedidoCompleto;
        pix: { valor: string; txid: string; copia_cola: string; qr_code_base64: string } | null;
      }>("/pedidos/visitante", {
        visitante_nome: nomeVisitante.trim(),
        itens: Object.entries(carrinhoVisitante).map(([produto_id, item]) => ({
          produto_id,
          quantidade: item.quantidade,
          brinde: item.cortesia,
        })),
      }),
    onSuccess: (resposta) => {
      setConfirmarCortesiaAberto(false);
      setVendaGerada(resposta);
      recarregarAposVendaVisitante();
    },
  });

  const confirmarPagamento = useMutation({
    mutationFn: () => api.post<PedidoCompleto>(`/pedidos/${vendaGerada?.pedido.id}/confirmar-pix`),
    onSuccess: () => {
      recarregarAposVendaVisitante();
      fecharVisitante();
    },
  });

  const cancelarVenda = useMutation({
    mutationFn: () =>
      api.post(`/pedidos/${vendaGerada?.pedido.id}/cancelar`, {
        motivo: "Visitante desistiu antes de pagar.",
      }),
    onSuccess: () => {
      recarregarAposVendaVisitante();
      fecharVisitante();
    },
  });

  const confirmarDaLista = useMutation({
    mutationFn: (pedidoId: string) => api.post<PedidoCompleto>(`/pedidos/${pedidoId}/confirmar-pix`),
    onSuccess: recarregarAposVendaVisitante,
  });

  const cancelarDaLista = useMutation({
    mutationFn: (pedidoId: string) =>
      api.post(`/pedidos/${pedidoId}/cancelar`, { motivo: "Visitante desistiu antes de pagar." }),
    onSuccess: recarregarAposVendaVisitante,
  });

  function abrirVisitante() {
    fecharVisitante();
    gerarVenda.reset();
    confirmarPagamento.reset();
    cancelarVenda.reset();
    setVisitanteAberto(true);
  }

  function alterarQuantidadeVisitante(produto: ProdutoVitrine, delta: number) {
    setCarrinhoVisitante((atual) => {
      const item = atual[produto.id] ?? { quantidade: 0, cortesia: false };
      const quantidade = item.quantidade + delta;
      if (quantidade <= 0) {
        const resto = { ...atual };
        delete resto[produto.id];
        return resto;
      }
      if (quantidade > produto.estoque) return atual;
      return { ...atual, [produto.id]: { ...item, quantidade } };
    });
  }

  function alternarCortesiaVisitante(produtoId: string) {
    setCarrinhoVisitante((atual) => {
      const item = atual[produtoId];
      if (!item) return atual;
      return { ...atual, [produtoId]: { ...item, cortesia: !item.cortesia } };
    });
  }

  const produtosFiltradosVisitante = useMemo(() => {
    const termo = buscaProdutoVisitante.trim().toLowerCase();
    const lista = produtosVisitante.data ?? [];
    if (!termo) return lista;
    return lista.filter((p) => p.nome.toLowerCase().includes(termo));
  }, [produtosVisitante.data, buscaProdutoVisitante]);

  const itensCarrinhoVisitante = useMemo(() => {
    const linhas: (ItemCarrinhoVisitante & { produto: ProdutoVitrine })[] = [];
    for (const [produtoId, item] of Object.entries(carrinhoVisitante)) {
      const produto = produtosVisitante.data?.find((p) => p.id === produtoId);
      if (produto) linhas.push({ ...item, produto });
    }
    return linhas;
  }, [carrinhoVisitante, produtosVisitante.data]);

  const totalCarrinhoVisitante = itensCarrinhoVisitante.reduce(
    (soma, item) => soma + (item.cortesia ? 0 : Number(item.produto.preco_venda) * item.quantidade),
    0,
  );

  async function copiarCodigoPix() {
    if (!vendaGerada?.pix) return;
    try {
      await navigator.clipboard.writeText(vendaGerada.pix.copia_cola);
      setCopiado(true);
    } catch {
      // Navegador sem permissão de clipboard — sem crash, só não copia.
    }
  }

  useEffect(() => {
    if (!copiado) return;
    const id = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(id);
  }, [copiado]);

  const erro =
    vendas.error ??
    almocos.error ??
    baixarDetalhado.error ??
    baixarConsolidado.error ??
    vendasVisitante.error;
  const erroVisitante = gerarVenda.error ?? confirmarPagamento.error ?? cancelarVenda.error;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">Vendas</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={abrirVisitante}>
            <UserPlus />
            Venda a visitante
          </Button>
          <Button
            variant="outline"
            onClick={() => baixarDetalhado.mutate()}
            disabled={!entregues.length || baixarDetalhado.isPending}
          >
            {baixarDetalhado.isPending ? "Gerando…" : "Detalhado"}
          </Button>
          <Button
            variant="destaque"
            onClick={() => baixarConsolidado.mutate()}
            disabled={!entregues.length || baixarConsolidado.isPending}
          >
            {baixarConsolidado.isPending ? "Gerando…" : "Consolidado por pessoa"}
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <FiltroPeriodo valor={filtro} aoMudar={setFiltro} />
      </div>

      {erro && (
        <div className="mb-4">
          <Aviso>{mensagemDeErro(erro, AVISOS)}</Aviso>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-suave">Receita</p>
            <p className="mt-1 text-xl font-bold">{dinheiro(totais.receita)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-suave">Lucro</p>
            <p className="mt-1 text-xl font-bold text-sucesso">{dinheiro(lucro)}</p>
            <p className="text-[11px] text-muito-suave">{margem.toFixed(0)}% de margem</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-suave">Itens vendidos</p>
            <p className="mt-1 text-xl font-bold">{totais.unidades}</p>
            <p className="text-[11px] text-muito-suave">{validos.length} pedidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-suave">Almoços</p>
            <p className="mt-1 text-xl font-bold">{almocosConfirmados.length}</p>
            <p className="text-[11px] text-muito-suave">confirmados</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="produtos">
        <TabsList className="mb-3">
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="visitante">Vendas a visitante</TabsTrigger>
        </TabsList>

        <TabsContent value="produtos">
          {(vendas.isLoading || almocos.isLoading) && <Carregando />}
          {vendas.data && porProduto.length === 0 && <Vazio>Nenhuma venda neste período.</Vazio>}

          {porProduto.length > 0 && (
            <Card className="overflow-x-auto">
              <Table className="tabela-admin">
                <TableHeader>
                  <TableRow>
                    <TableHeadOrdenavel
                      coluna="nome"
                      estado={ordenacaoProduto}
                      aoClicar={ordenacaoProduto.alternar}
                    >
                      Produto
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel
                      coluna="unidades"
                      estado={ordenacaoProduto}
                      aoClicar={ordenacaoProduto.alternar}
                      alinhar="direita"
                    >
                      Unidades
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel
                      coluna="receita"
                      estado={ordenacaoProduto}
                      aoClicar={ordenacaoProduto.alternar}
                      alinhar="direita"
                    >
                      Receita
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel
                      coluna="custo"
                      estado={ordenacaoProduto}
                      aoClicar={ordenacaoProduto.alternar}
                      alinhar="direita"
                    >
                      Custo
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel
                      coluna="lucro"
                      estado={ordenacaoProduto}
                      aoClicar={ordenacaoProduto.alternar}
                      alinhar="direita"
                    >
                      Lucro
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel
                      coluna="margem"
                      estado={ordenacaoProduto}
                      aoClicar={ordenacaoProduto.alternar}
                      alinhar="direita"
                    >
                      Margem
                    </TableHeadOrdenavel>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {produtosOrdenados.map((linha) => (
                    <TableRow key={linha.nome}>
                      <TableCell className="text-sm font-semibold">{linha.nome}</TableCell>
                      <TableCell className="text-right text-sm">{linha.unidades}</TableCell>
                      <TableCell className="text-right text-sm">
                        {dinheiro(linha.receita)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-suave">
                        {dinheiro(linha.custo)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold text-sucesso">
                        {dinheiro(linha.lucro)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-suave">
                        {linha.margem.toFixed(0)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="visitante">
          {vendasVisitante.isLoading && <Carregando />}
          {vendasVisitante.data && vendasVisitante.data.length === 0 && (
            <Vazio>Nenhuma venda a visitante neste período.</Vazio>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {(vendasVisitante.data ?? []).map((pedido) => (
              <Card key={pedido.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{pedido.visitante_nome}</p>
                      <p className="text-[11px] text-suave">{dataHora(pedido.criado_em)}</p>
                    </div>
                    <Badge variant={corStatusVisitante(pedido.status)} className="shrink-0">
                      {rotuloStatusVisitante(pedido.status)}
                    </Badge>
                  </div>

                  <div className="mt-3 border-t border-borda pt-2">
                    {pedido.itens.map((item, indice) => (
                      <div
                        key={`${item.produto_id ?? item.nome_produto}-${indice}`}
                        className="flex justify-between gap-2 py-0.5 text-[13px]"
                      >
                        <span className="min-w-0 truncate text-suave">
                          {item.quantidade}× {item.nome_produto}
                          {Number(item.preco_unitario) === 0 && " · cortesia"}
                        </span>
                        <span className="shrink-0 font-semibold">
                          {dinheiro(Number(item.preco_unitario) * item.quantidade)}
                        </span>
                      </div>
                    ))}
                    <div className="mt-1 flex justify-between border-t border-borda pt-1.5 text-sm font-extrabold">
                      <span>Total</span>
                      <span>{dinheiro(pedido.valor_total)}</span>
                    </div>
                  </div>

                  {pedido.status === "aguardando_pagamento" && (
                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => cancelarDaLista.mutate(pedido.id)}
                        disabled={cancelarDaLista.isPending}
                      >
                        Cancelar
                      </Button>
                      <Button
                        variant="destaque"
                        size="sm"
                        onClick={() => confirmarDaLista.mutate(pedido.id)}
                        disabled={confirmarDaLista.isPending}
                      >
                        Confirmar pagamento
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={visitanteAberto} onOpenChange={(aberto) => !aberto && fecharVisitante()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Venda a visitante</DialogTitle>
            <DialogDescription>
              {vendaGerada
                ? "Pague pelo Pix abaixo e confirme quando o pagamento cair."
                : confirmarCortesiaAberto
                  ? "Confirme antes de liberar — essa venda não cobra nada do visitante."
                  : "Monte o carrinho e marque os itens de cortesia, se houver."}
            </DialogDescription>
          </DialogHeader>

          {!vendaGerada && confirmarCortesiaAberto && (
            <div className="rounded-lg border border-borda p-3 text-sm">
              <p>
                Essa venda é <strong>100% cortesia</strong>: nenhum Pix vai ser gerado e nada vai
                ser cobrado do visitante.
              </p>
              <p className="mt-2 text-suave">
                Ao confirmar, o estoque já sai baixado e a venda é registrada como concluída na
                hora — não dá pra desfazer por aqui depois.
              </p>
            </div>
          )}

          {!vendaGerada && !confirmarCortesiaAberto && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="nome-visitante-venda">Nome do visitante</Label>
                <Input
                  id="nome-visitante-venda"
                  value={nomeVisitante}
                  onChange={(e) => setNomeVisitante(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="busca-produto-venda">Produto</Label>
                <Input
                  id="busca-produto-venda"
                  value={buscaProdutoVisitante}
                  onChange={(e) => setBuscaProdutoVisitante(e.target.value)}
                  placeholder="Buscar produto…"
                />
              </div>

              {produtosVisitante.isLoading && <Carregando />}
              <div className="max-h-40 overflow-y-auto rounded-lg border border-borda">
                {produtosFiltradosVisitante.map((produto) => (
                  <div
                    key={produto.id}
                    className="flex items-center justify-between gap-2 border-b border-borda p-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{produto.nome}</p>
                      <p className="text-[11px] text-suave">
                        {dinheiro(produto.preco_venda)} · {produto.estoque} em estoque
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => alterarQuantidadeVisitante(produto, 1)}
                      disabled={(carrinhoVisitante[produto.id]?.quantidade ?? 0) >= produto.estoque}
                    >
                      <Plus />
                    </Button>
                  </div>
                ))}
                {produtosFiltradosVisitante.length === 0 && !produtosVisitante.isLoading && (
                  <p className="p-3 text-center text-xs text-suave">Nenhum produto encontrado.</p>
                )}
              </div>

              {itensCarrinhoVisitante.length > 0 && (
                <div className="rounded-lg border border-borda p-3">
                  <p className="mb-2 text-xs font-bold">Carrinho</p>
                  <div className="grid gap-2">
                    {itensCarrinhoVisitante.map(({ produto, quantidade, cortesia }) => (
                      <div key={produto.id} className="rounded-md border border-borda p-2 text-sm">
                        <p className="truncate font-semibold">{produto.nome}</p>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="size-7"
                              onClick={() => alterarQuantidadeVisitante(produto, -1)}
                            >
                              <Minus className="size-3" />
                            </Button>
                            <span className="w-5 text-center text-xs font-bold">{quantidade}</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="size-7"
                              onClick={() => alterarQuantidadeVisitante(produto, 1)}
                              disabled={quantidade >= produto.estoque}
                            >
                              <Plus className="size-3" />
                            </Button>
                          </div>
                          <label className="flex shrink-0 items-center gap-1 text-[11px] text-suave">
                            <input
                              type="checkbox"
                              checked={cortesia}
                              onChange={() => alternarCortesiaVisitante(produto.id)}
                            />
                            Cortesia
                          </label>
                          <span
                            className={
                              "shrink-0 text-right font-semibold" +
                              (cortesia ? " text-suave line-through" : "")
                            }
                          >
                            {dinheiro(Number(produto.preco_venda) * quantidade)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between border-t border-borda pt-2 text-sm font-extrabold">
                    <span>Total a pagar</span>
                    <span>{dinheiro(totalCarrinhoVisitante)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {vendaGerada && (
            <div className="grid gap-3 text-center">
              <p className="text-sm font-semibold text-suave">{vendaGerada.pedido.visitante_nome}</p>
              {vendaGerada.pix ? (
                <>
                  <img
                    src={vendaGerada.pix.qr_code_base64}
                    alt="QR Code Pix"
                    className="mx-auto h-48 w-48"
                  />
                  <p className="text-xl font-extrabold">{dinheiro(vendaGerada.pix.valor)}</p>
                  <Button type="button" variant="outline" onClick={() => void copiarCodigoPix()}>
                    {copiado ? <Check /> : <Copy />}
                    {copiado ? "Copiado!" : "Copiar código Pix"}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-sucesso">Venda 100% cortesia — já confirmada.</p>
              )}
            </div>
          )}

          {erroVisitante && <Aviso>{mensagemDeErro(erroVisitante, AVISOS)}</Aviso>}

          <DialogFooter>
            {!vendaGerada && !confirmarCortesiaAberto && (
              <>
                <Button variant="outline" onClick={fecharVisitante}>
                  Cancelar
                </Button>
                <Button
                  variant="destaque"
                  disabled={
                    !nomeVisitante.trim() ||
                    itensCarrinhoVisitante.length === 0 ||
                    gerarVenda.isPending
                  }
                  onClick={() =>
                    totalCarrinhoVisitante > 0
                      ? gerarVenda.mutate()
                      : setConfirmarCortesiaAberto(true)
                  }
                >
                  {gerarVenda.isPending
                    ? "Gerando…"
                    : totalCarrinhoVisitante > 0
                      ? "Gerar Pix"
                      : "Confirmar"}
                </Button>
              </>
            )}
            {!vendaGerada && confirmarCortesiaAberto && (
              <>
                <Button variant="outline" onClick={() => setConfirmarCortesiaAberto(false)}>
                  Voltar
                </Button>
                <Button
                  variant="destaque"
                  disabled={gerarVenda.isPending}
                  onClick={() => gerarVenda.mutate()}
                >
                  {gerarVenda.isPending ? "Confirmando…" : "Confirmar liberação"}
                </Button>
              </>
            )}
            {vendaGerada?.pix && (
              <>
                <Button
                  variant="outline"
                  onClick={() => cancelarVenda.mutate()}
                  disabled={cancelarVenda.isPending}
                >
                  Cancelar venda
                </Button>
                <Button
                  variant="destaque"
                  onClick={() => confirmarPagamento.mutate()}
                  disabled={confirmarPagamento.isPending}
                >
                  {confirmarPagamento.isPending ? "Confirmando…" : "Confirmar pagamento"}
                </Button>
              </>
            )}
            {vendaGerada && !vendaGerada.pix && (
              <Button variant="destaque" onClick={fecharVisitante}>
                Fechar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
