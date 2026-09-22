/**
 * Cliente HTTP da API.
 *
 * Só transporte e tradução de erro. A política de sessão mora em config.ts.
 */

import { enviar } from "@/api/config";

export class ErroApi extends Error {
  constructor(
    readonly codigo: string,
    mensagem: string,
    readonly status: number,
    readonly correlacaoId?: string,
    readonly detalhes?: Record<string, unknown>,
  ) {
    super(mensagem);
    this.name = "ErroApi";
  }
}

type Corpo = Record<string, unknown> | undefined;

async function pedir<T>(metodo: string, caminho: string, corpo?: Corpo): Promise<T> {
  const resposta = await enviar(metodo, caminho, corpo);

  if (resposta.status === 204) return undefined as T;

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    
    throw new ErroApi(
      dados?.codigo ?? "erro_desconhecido",
      dados?.mensagem ?? "Não foi possível completar a operação.",
      resposta.status,
      dados?.correlacao_id,
      dados?.detalhes,
    );
  }
  return dados as T;
}

export const api = {
  get: <T>(caminho: string) => pedir<T>("GET", caminho),
  post: <T>(caminho: string, corpo?: Corpo) => pedir<T>("POST", caminho, corpo),
  put: <T>(caminho: string, corpo?: Corpo) => pedir<T>("PUT", caminho, corpo),
  patch: <T>(caminho: string, corpo?: Corpo) => pedir<T>("PATCH", caminho, corpo),
  remover: <T>(caminho: string) => pedir<T>("DELETE", caminho),
};
