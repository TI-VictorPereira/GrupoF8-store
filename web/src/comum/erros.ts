/**
 * Texto de erro para o usuário.
 */

import { ErroApi } from "@/api/cliente";

const GLOBAIS: Record<string, string> = {
  nao_autenticado: "Sua sessão expirou. Entre de novo.",
  dados_invalidos: "Confira os campos e tente de novo.",
};

export function mensagemDeErro(erro: unknown, daTela: Record<string, string> = {}): string {

  if (!(erro instanceof ErroApi)) return "Não foi possível completar a operação.";

  return daTela[erro.codigo] ?? GLOBAIS[erro.codigo] ?? erro.message;
}
