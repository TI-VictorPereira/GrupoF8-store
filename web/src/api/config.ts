/**
 * Política de sessão do cliente HTTP
 * */

export const BASE = "/api";

const SEM_RENOVACAO = new Set(["/auth/login", "/auth/refresh", "/auth/solicitar-senha"]);

type Reacao = () => void;

let aoEncerrarSessao: Reacao = () => {};

export function quandoSessaoEncerrar(reacao: Reacao): void {
  aoEncerrarSessao = reacao;
}

let renovacaoEmVoo: Promise<boolean> | null = null;

function renovar(): Promise<boolean> {
  renovacaoEmVoo ??= fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    credentials: "same-origin",
  })
    .then((resposta) => resposta.ok)
    .catch(() => false)
    .finally(() => {
      renovacaoEmVoo = null;
    });
  return renovacaoEmVoo;
}


export async function enviar(
  metodo: string,
  caminho: string,
  corpo?: Record<string, unknown>,
): Promise<Response> {
  const opcoes: RequestInit = {
    method: metodo,
    credentials: "same-origin",
    headers: corpo ? { "content-type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  };

  const resposta = await fetch(`${BASE}${caminho}`, opcoes);
  if (resposta.status !== 401) return resposta;

  const rota = caminho.split("?")[0]!;
  if (SEM_RENOVACAO.has(rota)) return resposta;

  if (await renovar()) return fetch(`${BASE}${caminho}`, opcoes);

  aoEncerrarSessao();
  return resposta;
}
