import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/cliente";
import { PAPEIS_BALCAO } from "@/comum/navegacao";
import type { LinhaEntrega } from "@/interfaces/admin";
import type { Pagina } from "@/interfaces/comum";
import type { LinhaPainel } from "@/interfaces/refeitorio";
import type { Papel } from "@/interfaces/sessao";

export interface Pendencias {
  almocos: number;
  pedidos: number;
}

const VAZIO: Pendencias = { almocos: 0, pedidos: 0 };


export function usePendencias(papel: Papel): Pendencias {
  const { data } = useQuery({
    queryKey: ["admin-pendencias", papel],
    // Só o balcão (admin e entregador): /almocos/hoje e /pedidos/pendentes são
    // dele. Os outros papéis levariam 403 a cada 15 segundos.
    enabled: PAPEIS_BALCAO.includes(papel),
    refetchInterval: 15_000,
    queryFn: async (): Promise<Pendencias> => {
      const [almocos, pedidos] = await Promise.all([
        api.get<LinhaPainel[]>("/almocos/hoje?status=pendente"),
        api.get<Pagina<LinhaEntrega>>("/pedidos/pendentes?por_pagina=1"),
      ]);
      return { almocos: almocos.length, pedidos: pedidos.total };
    },
  });

  return data ?? VAZIO;
}
