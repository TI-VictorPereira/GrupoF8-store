import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/cliente";
import { Cabecalho } from "@/componentes/Cabecalho";
import { Carregando } from "@/componentes/Carregando";
import { Moldura } from "@/componentes/Moldura";
import { Vazio } from "@/componentes/Vazio";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/componentes/ui/select";
import { dataHora, dinheiro, mesPorExtenso } from "@/comum/formato";
import { PAGINA_APP } from "@/comum/layout";
import { cn } from "@/comum/utilitarios";
import type { Extrato } from "@/interfaces/consumo";

const ROTULO_STATUS: Record<string, string> = {
  pendente: "Aguardando",
  entregue: "Entregue",
  cancelado: "Cancelado",
  confirmado: "Confirmado",
  expirado: "Expirado",
};

export function Consumo() {
  const [competencia, setCompetencia] = useState<string | undefined>(undefined);

  const meses = useQuery({
    queryKey: ["competencias"],
    queryFn: () => api.get<string[]>("/consumo/competencias"),
  });
  const extrato = useQuery({
    queryKey: ["extrato", competencia ?? "atual"],
    queryFn: () =>
      api.get<Extrato>(`/consumo/me${competencia ? `?competencia=${competencia}` : ""}`),
  });

  return (
    <Moldura>
      <Cabecalho titulo="Meu consumo" />

      <div className={cn(PAGINA_APP, "pt-4")}>
        <Select
          value={competencia ?? meses.data?.[0] ?? ""}
          onValueChange={setCompetencia}
        >
          <SelectTrigger aria-label="Mês">
            <SelectValue placeholder="Escolha o mês" />
          </SelectTrigger>
          <SelectContent>
            {(meses.data ?? []).map((mes) => (
              <SelectItem key={mes} value={mes}>
                {mesPorExtenso(mes)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {extrato.data && (
        <div
          className={cn(
            PAGINA_APP,
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

      <div className={cn(PAGINA_APP, "py-5")}>
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
                {lancamento.status === "cancelado" && (
                  <span className="ml-2 text-[11px] font-normal text-perigo">cancelado</span>
                )}
              </p>
              <p className="truncate text-[11px] text-suave">
                {lancamento.descricao} · {dataHora(lancamento.data)} ·{" "}
                {ROTULO_STATUS[lancamento.status] ?? lancamento.status}
              </p>
            </div>
            <span
              className={`shrink-0 text-sm font-bold ${
                lancamento.status === "cancelado" ? "text-muito-suave line-through" : ""
              }`}
            >
              {Number(lancamento.valor) > 0 ? dinheiro(lancamento.valor) : "—"}
            </span>
          </div>
        ))}
      </div>
    </Moldura>
  );
}
