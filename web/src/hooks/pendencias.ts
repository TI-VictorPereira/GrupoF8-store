import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/cliente";
import type { LinhaEntrega } from "@/interfaces/admin";
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
    enabled: papel !== "colaborador",
    refetchInterval: 15_000,
    queryFn: async (): Promise<Pendencias> => {
      const [almocos, pedidos] = await Promise.all([
        api.get<LinhaPainel[]>("/almocos/hoje?status=pendente"),
        papel === "admin" ? api.get<LinhaEntrega[]>("/pedidos/pendentes") : Promise.resolve([]),
      ]);
      return { almocos: almocos.length, pedidos: pedidos.length };
    },
  });

  return data ?? VAZIO;
}
