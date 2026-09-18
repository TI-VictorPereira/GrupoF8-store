/**
 * Sessão do usuário.
 *
 * Não existe token guardado no front: a sessão é um cookie httpOnly que o
 * navegador manda sozinho. Saber quem está logado é, portanto, uma pergunta
 * ao servidor — e é o TanStack Query que cuida do cache dessa resposta.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ErroApi, api } from "@/api/cliente";
import type { Eu } from "@/interfaces/sessao";

export const CHAVE_EU = ["eu"] as const;

export function useSessao() {
  const consulta = useQuery({
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
    // Zera o cache inteiro: qualquer dado em memória era da sessão anterior.
    onSettled: () => clienteConsulta.clear(),
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
