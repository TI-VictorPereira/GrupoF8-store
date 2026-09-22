/**
 * Cliente do TanStack Query.
 *
 * Quem detecta a sessão vencida é o transporte (api/config.ts). Aqui só se
 * liga o aviso à consequência na interface, que é a mesma do botão Sair.
 */

import { QueryClient } from "@tanstack/react-query";

import { quandoSessaoEncerrar } from "@/api/config";
import { CHAVE_EU, encerrarSessaoLocal } from "@/hooks/sessao";

export const clienteConsulta = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

quandoSessaoEncerrar(() => {
  if (clienteConsulta.getQueryData(CHAVE_EU) === null) return;
  encerrarSessaoLocal(clienteConsulta);
});
