/**
 * Sessão do usuário.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { ErroApi, api } from "@/api/cliente";
import type { Eu } from "@/interfaces/sessao";

export const CHAVE_EU = ["eu"] as const;

export function encerrarSessaoLocal(cliente: QueryClient): void {
  cliente.setQueryData(CHAVE_EU, null);
  cliente.removeQueries({ predicate: (c) => c.queryKey[0] !== CHAVE_EU[0] });
}

export function useSessao() {
  const consulta = useQuery<Eu | null>({
    queryKey: CHAVE_EU,
    queryFn: () => api.get<Eu>("/auth/eu"),
    retry: false,
    staleTime: 30_000,
  });

  const naoAutenticado =
    consulta.error instanceof ErroApi && consulta.error.status === 401;

  return {
    eu: naoAutenticado ? null : (consulta.data ?? null),
    carregando: consulta.isLoading,
    erro: naoAutenticado ? null : consulta.error,
  };
}

export function useEntrar() {
  const clienteConsulta = useQueryClient();
  return useMutation({
    mutationFn: (dados: { codigo: string; senha: string }) =>
      api.post<Eu>("/auth/login", dados),
    onSuccess: (eu) => clienteConsulta.setQueryData(CHAVE_EU, eu),
  });
}

export function useSair() {
  const clienteConsulta = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSettled: () => encerrarSessaoLocal(clienteConsulta),
  });
}

export function useTrocarSenha() {
  const clienteConsulta = useQueryClient();
  return useMutation({
    mutationFn: (dados: { senha_atual: string; senha_nova: string }) =>
      api.post("/auth/senha", dados),
    onSuccess: () => clienteConsulta.invalidateQueries({ queryKey: CHAVE_EU }),
  });
}
