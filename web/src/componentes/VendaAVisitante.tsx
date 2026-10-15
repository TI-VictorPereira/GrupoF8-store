import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Minus, Plus, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { Carregando } from "@/componentes/Carregando";
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
import { mensagemDeErro } from "@/comum/erros";
import { dataHora, dinheiro } from "@/comum/formato";
import type { PedidoCompleto, VendaAVisitanteResposta } from "@/interfaces/admin";
import type { ProdutoVitrine } from "@/interfaces/loja";

const AVISOS: Record<string, string> = {
  produto_indisponivel: "Este produto saiu da loja.",
  estoque_insuficiente: "Não há estoque suficiente para essa quantidade.",
  nome_obrigatorio: "O nome do visitante é obrigatório.",
  pix_nao_configurado: "Pix não configurado. Fale com o suporte.",
  pedido_nao_aguardando_pagamento: "Esta venda já foi tratada.",
  pedido_nao_pendente: "Esta venda já foi tratada.",
};

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

export function CartaoVendaVisitante({
  pedido,
  aoConfirmar,
  aoCancelar,
  confirmando,
  cancelando,
}: {
  pedido: PedidoCompleto;
  aoConfirmar: () => void;
  aoCancelar: () => void;
  confirmando: boolean;
  cancelando: boolean;
}) {
  return (
    <Card>
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
                {item.brinde && " · cortesia"}
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
            <Button variant="outline" size="sm" onClick={aoCancelar} disabled={cancelando}>
              Cancelar
            </Button>
            <Button variant="destaque" size="sm" onClick={aoConfirmar} disabled={confirmando}>
              Confirmar pagamento
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function VendaAVisitante() {
  const clienteConsulta = useQueryClient();

  const [visitanteAberto, setVisitanteAberto] = useState(false);
  const [nomeVisitante, setNomeVisitante] = useState("");
  const [buscaProdutoVisitante, setBuscaProdutoVisitante] = useState("");
  const [carrinhoVisitante, setCarrinhoVisitante] = useState<
    Record<string, ItemCarrinhoVisitante>
  >({});
  const [vendaGerada, setVendaGerada] = useState<VendaAVisitanteResposta | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [confirmarCortesiaAberto, setConfirmarCortesiaAberto] = useState(false);

  const produtosVisitante = useQuery({
    queryKey: ["produtos-vitrine-visitante"],
    queryFn: () => api.get<ProdutoVitrine[]>("/produtos/vitrine"),
    enabled: visitanteAberto && !vendaGerada,
  });

  function recarregarAposVendaVisitante() {
    void clienteConsulta.invalidateQueries({ queryKey: ["vendas-visitante"] });
    void clienteConsulta.invalidateQueries({ queryKey: ["visitantes-aguardando"] });
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
      api.post<VendaAVisitanteResposta>("/pedidos/visitante", {
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

  const erroVisitante = gerarVenda.error ?? confirmarPagamento.error ?? cancelarVenda.error;

  return (
    <>
      <Button variant="outline" onClick={abrirVisitante}>
        <UserPlus />
        Venda a visitante
      </Button>

      <Dialog open={visitanteAberto} onOpenChange={(aberto) => !aberto && fecharVisitante()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Venda a visitante</DialogTitle>
            <DialogDescription>
              {vendaGerada
                ? "Pague pelo Pix abaixo e confirme quando o pagamento cair."
                : confirmarCortesiaAberto
                  ? "Confirme antes de liberar: essa venda não cobra nada do visitante."
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
                hora. Não dá pra desfazer por aqui depois.
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
                  <div className="text-xs text-suave">
                    <p>{vendaGerada.pix.recebedor}</p>
                    <p>{vendaGerada.pix.chave}</p>
                  </div>
                  <Button type="button" variant="outline" onClick={() => void copiarCodigoPix()}>
                    {copiado ? <Check /> : <Copy />}
                    {copiado ? "Copiado!" : "Copiar código Pix"}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-sucesso">Venda 100% cortesia, já confirmada.</p>
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
    </>
  );
}
