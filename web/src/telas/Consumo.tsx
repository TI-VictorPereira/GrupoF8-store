import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/cliente";
import { Cabecalho } from "@/componentes/Cabecalho";
import { Carregando } from "@/componentes/Carregando";
import { Help } from "@/componentes/Help";
import { Moldura } from "@/componentes/Moldura";
import { Vazio } from "@/componentes/Vazio";
import { Button } from "@/componentes/ui/button";
import { Card, CardContent } from "@/componentes/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/componentes/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/componentes/ui/tabs";
import { dataHora, diaMes, dinheiro, mesPorExtenso } from "@/comum/formato";
import { PAGINA_APP } from "@/comum/layout";
import { cicloDe } from "@/comum/periodo";
import { cn } from "@/comum/utilitarios";
import type { Extrato } from "@/interfaces/consumo";
import type { Pedido } from "@/interfaces/loja";


const ROTULO_STATUS: Record<string, string> = {
  pendente: "Aguardando retirada",
  entregue: "Entregue",
  confirmado: "Confirmado",
};

const CHAVE_AVISO_VISTO = "f8:consumo:ciclo-explicado";


function useAvisoDeCicloVisto() {
  const [visto, setVisto] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_AVISO_VISTO) === "1";
    } catch {
      return false;
    }
  });

  function marcarComoVisto() {
    try {
      localStorage.setItem(CHAVE_AVISO_VISTO, "1");
    } catch {
      // sem storage, só não persiste — a tela continua funcionando
    }
    setVisto(true);
  }

  return { visto, marcarComoVisto };
}

export function Consumo() {
  const [competencia, setCompetencia] = useState<string | undefined>(undefined);
  const [aba, setAba] = useState("consumo");
  const { visto, marcarComoVisto } = useAvisoDeCicloVisto();

  const meses = useQuery({
    queryKey: ["competencias"],
    queryFn: () => api.get<string[]>("/consumo/competencias"),
  });
  const extrato = useQuery({
    queryKey: ["extrato", competencia ?? "atual"],
    queryFn: () =>
      api.get<Extrato>(`/consumo/me${competencia ? `?competencia=${competencia}` : ""}`),
  });

  const meusPedidos = useQuery({
    queryKey: ["meus-pedidos"],
    queryFn: () => api.get<Pedido[]>("/pedidos/me"),
    enabled: aba === "cancelados",
  });
  const cancelados = (meusPedidos.data ?? []).filter((p) => p.status === "cancelado");

  return (
    <Moldura>
      <Cabecalho titulo="Meu consumo" />

      <Tabs value={aba} onValueChange={setAba} className={cn(PAGINA_APP, "pt-4")}>
        <TabsList>
          <TabsTrigger value="consumo">Consumo</TabsTrigger>
          <TabsTrigger value="cancelados">Cancelados</TabsTrigger>
        </TabsList>

        <TabsContent value="consumo">
        {!visto && (
          <Card className="border-accent mb-3">
            <CardContent className="p-3">
              <p className="text-sm">
                <span className="font-bold">Seu consumo é organizado por ciclo,</span> não pelo
                mês do calendário: cada ciclo vai do dia 21 ao dia 20 do mês seguinte, e leva o
                nome do mês em que fecha. Mesma regra da folha de pagamento. Use o menu abaixo
                para ver ciclos anteriores.
              </p>
              <Button size="sm" className="mt-2" onClick={marcarComoVisto}>
                Entendido
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="mb-1.5 flex items-center gap-1">
          <span className="text-xs font-semibold text-suave">Ciclo</span>
          <Help>
            O ciclo vai do dia 21 ao dia 20 do mês seguinte, e leva o nome do mês em que fecha.
            Mesma regra da folha de pagamento. Quem comprou ou almoçou em 25 de agosto está no
            ciclo de setembro.
          </Help>
        </div>

        <Select
          value={competencia ?? meses.data?.[0] ?? ""}
          onValueChange={setCompetencia}
        >
          <SelectTrigger aria-label="Mês">
            <SelectValue placeholder="Escolha o mês" />
          </SelectTrigger>
          <SelectContent>
{/* O ciclo fecha no dia 20, então "setembro" não é o mês do calendário.
                Mostrar o intervalo aqui é o suficiente: é onde a pessoa escolhe. */}
            {(meses.data ?? []).map((mes) => {
              const ciclo = cicloDe(mes);
              return (
                <SelectItem key={mes} value={mes}>
                  {mesPorExtenso(mes)} · {diaMes(ciclo.de)} a {diaMes(ciclo.ate)}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {extrato.data && (
          <div
            className={cn(
              "mt-4 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3",
            )}
          >
            <div className="rounded-xl border border-borda p-3">
              <p className="text-[11px] text-suave">Gasto na loja</p>
              <p className="mt-1 text-lg font-bold">{dinheiro(extrato.data.total_loja)}</p>
            </div>
            <div className="rounded-xl border border-borda p-3">
              <p className="text-[11px] text-suave">Almoços</p>
              <p className="mt-1 text-lg font-bold">{extrato.data.quantidade_almocos}</p>
            </div>
          </div>
        )}

        <div className="py-5">
          {extrato.isLoading && <Carregando />}
          {extrato.data?.lancamentos.length === 0 && <Vazio>Nenhum consumo neste mês.</Vazio>}

          {extrato.data?.lancamentos.map((lancamento) => (
            <div
              key={`${lancamento.tipo}-${lancamento.id}`}
              className="flex items-center justify-between gap-3 border-b border-borda py-2.5 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {lancamento.tipo === "loja" ? "Compra na loja" : "Almoço"}
                </p>
                <p className="truncate text-[11px] text-suave">
                  {lancamento.descricao} · {dataHora(lancamento.data)} ·{" "}
                  {ROTULO_STATUS[lancamento.status] ?? lancamento.status}
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold">
                {Number(lancamento.valor) > 0 ? dinheiro(lancamento.valor) : "—"}
              </span>
            </div>
          ))}
        </div>
        </TabsContent>

        <TabsContent value="cancelados">
          <div className="py-5">
            {meusPedidos.isLoading && <Carregando />}
            {meusPedidos.data && cancelados.length === 0 && (
              <Vazio>Nenhum pedido cancelado.</Vazio>
            )}

            {cancelados.map((pedido) => (
              <div
                key={pedido.id}
                className="border-b border-borda py-2.5 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold">
                    Pedido {pedido.codigo_retirada}
                  </p>
                  <span className="shrink-0 text-sm font-bold text-suave line-through">
                    {dinheiro(pedido.valor_total)}
                  </span>
                </div>
                <p className="truncate text-[11px] text-suave">
                  {dataHora(pedido.cancelado_em ?? pedido.criado_em)}
                  {pedido.motivo_cancelamento ? ` · ${pedido.motivo_cancelamento}` : ""}
                </p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </Moldura>
  );
}
