import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { Carregando } from "@/componentes/Carregando";
import { TableHeadOrdenavel } from "@/componentes/TableHeadOrdenavel";
import { Vazio } from "@/componentes/Vazio";
import { CartaoVendaVisitante, VendaAVisitante } from "@/componentes/VendaAVisitante";
import { Button } from "@/componentes/ui/button";
import { Card, CardContent } from "@/componentes/ui/card";
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
import { dinheiro } from "@/comum/formato";
import { ordenar, useOrdenacao } from "@/comum/ordenacao";
import { intervaloDoFiltro, periodoInicial } from "@/comum/periodo";
import type { PedidoCompleto, LinhaPedido } from "@/interfaces/admin";
import type { Pagina } from "@/interfaces/comum";
import type { LinhaPainel } from "@/interfaces/refeitorio";

const AVISOS: Record<string, string> = {
  periodo_invalido: "A data final não pode ser anterior à inicial.",
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

export function Vendas() {
  const clienteConsulta = useQueryClient();
  const [filtro, setFiltro] = useState(() => periodoInicial("ciclo"));
  const { de, ate } = intervaloDoFiltro(filtro);

  const vendas = useQuery({
    queryKey: ["vendas", de, ate],
    queryFn: () => api.get<LinhaPedido[]>(`/pedidos?de=${de}&ate=${ate}`),
  });
  // Só a contagem interessa aqui — pede 1 item e lê o total, sem trazer a lista inteira.
  const almocosConfirmados = useQuery({
    queryKey: ["almocos-confirmados", de, ate],
    queryFn: () =>
      api.get<Pagina<LinhaPainel>>(`/almocos?de=${de}&ate=${ate}&status=confirmado&por_pagina=1`),
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
            // Brinde não é receita (ninguém pagou), mas o custo é real: a
            // empresa comprou a mercadoria do mesmo jeito.
            if (!item.brinde) acumulado.receita += Number(item.preco_unitario) * item.quantidade;
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
        if (!item.brinde) atual.receita += Number(item.preco_unitario) * item.quantidade;
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

  const visitantePix = useMemo(() => {
    const pagos = (vendasVisitante.data ?? []).filter(
      (p) => p.status === "entregue" && p.pix_txid,
    );
    return {
      total: pagos.reduce((soma, p) => soma + Number(p.valor_total), 0),
      quantidade: pagos.length,
    };
  }, [vendasVisitante.data]);

  const cortesiasVisitante = useMemo(
    () =>
      (vendasVisitante.data ?? [])
        .flatMap((p) => p.itens)
        .filter((item) => item.brinde)
        .reduce((soma, item) => soma + item.quantidade, 0),
    [vendasVisitante.data],
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

  const confirmarDaLista = useMutation({
    mutationFn: (pedidoId: string) => api.post<PedidoCompleto>(`/pedidos/${pedidoId}/confirmar-pix`),
    onSuccess: recarregarAposVendaVisitante,
  });

  const cancelarDaLista = useMutation({
    mutationFn: (pedidoId: string) =>
      api.post(`/pedidos/${pedidoId}/cancelar`, { motivo: "Visitante desistiu antes de pagar." }),
    onSuccess: recarregarAposVendaVisitante,
  });

  const erro =
    vendas.error ??
    almocosConfirmados.error ??
    baixarDetalhado.error ??
    baixarConsolidado.error ??
    vendasVisitante.error;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">Vendas</h1>
        <div className="flex flex-wrap gap-2">
          <VendaAVisitante />
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

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
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
            <p className="mt-1 text-xl font-bold">{almocosConfirmados.data?.total ?? 0}</p>
            <p className="text-[11px] text-muito-suave">confirmados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-suave">Visitantes (Pix)</p>
            <p className="mt-1 text-xl font-bold">{dinheiro(visitantePix.total)}</p>
            <p className="text-[11px] text-muito-suave">{visitantePix.quantidade} pago(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-suave">Cortesias</p>
            <p className="mt-1 text-xl font-bold">{cortesiasVisitante}</p>
            <p className="text-[11px] text-muito-suave">itens dados de graça</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="produtos">
        <TabsList className="mb-3">
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="visitante">Vendas a visitante</TabsTrigger>
        </TabsList>

        <TabsContent value="produtos">
          {(vendas.isLoading || almocosConfirmados.isLoading) && <Carregando />}
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
              <CartaoVendaVisitante
                key={pedido.id}
                pedido={pedido}
                aoConfirmar={() => confirmarDaLista.mutate(pedido.id)}
                aoCancelar={() => cancelarDaLista.mutate(pedido.id)}
                confirmando={confirmarDaLista.isPending}
                cancelando={cancelarDaLista.isPending}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
