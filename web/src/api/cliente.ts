/**
 * Cliente HTTP da API.
 *
 * Tudo sai por `/api`, na mesma origem — o proxy do Vite em desenvolvimento e
 * o Caddy em produção fazem o mesmo caminho. Por isso `credentials: "include"`
 * não é necessário para cookie de mesma origem, mas fica explícito para o dia
 * em que alguém mover a API para outro domínio e precisar reavaliar.
 */

const BASE = "/api";

/** Erro previsto pela API: sempre tem `codigo` estável e `correlacao_id`. */
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
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    credentials: "same-origin",
    headers: corpo ? { "content-type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  if (resposta.status === 204) return undefined as T;

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    // A API padroniza o erro; a decisão no front é sempre pelo `codigo`, nunca
    // pelo texto da mensagem — texto muda, código é contrato.
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
