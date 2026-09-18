import { useState, type FormEvent } from "react";

import { ErroApi } from "@/api/cliente";
import { useEntrar } from "@/comum/sessao";

/** Mensagem por código, nunca por texto vindo do servidor. */
const AVISOS: Record<string, string> = {
  credenciais_invalidas: "Código ou senha inválidos.",
  acesso_bloqueado: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  colaborador_inativo: "Seu acesso está inativo. Procure o RH.",
  senha_provisoria_expirada: "A senha temporária expirou. Peça uma nova ao administrador.",
};

export function Login() {
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [pedidoEnviado, setPedidoEnviado] = useState(false);
  const entrar = useEntrar();

  const erro = entrar.error instanceof ErroApi ? entrar.error : null;
  const aviso = erro
    ? (AVISOS[erro.codigo] ?? "Não foi possível entrar. Tente novamente.")
    : null;

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    entrar.mutate({ codigo: codigo.trim(), senha });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-ink text-lg font-black text-accent">
            F8
          </div>
          <h1 className="text-lg font-bold">Loja Interna</h1>
          <p className="mt-1 text-sm text-suave">Entre com seu código e senha</p>
        </div>

        <form onSubmit={enviar} className="flex flex-col gap-3">
          <label className="text-xs font-semibold text-suave" htmlFor="codigo">
            Código
          </label>
          <input
            id="codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            inputMode="numeric"
            autoComplete="username"
            autoFocus
            className="-mt-2 rounded-lg border border-borda bg-card px-3 py-2.5 text-sm outline-none focus:border-ink"
          />

          <label className="text-xs font-semibold text-suave" htmlFor="senha">
            Senha
          </label>
          <input
            id="senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            className="-mt-2 rounded-lg border border-borda bg-card px-3 py-2.5 text-sm outline-none focus:border-ink"
          />

          {aviso && (
            <p className="rounded-lg border border-perigo/30 bg-perigo/10 px-3 py-2 text-sm font-medium text-perigo">
              {aviso}
              {erro?.codigo === "erro_interno" && (
                <span className="mt-1 block text-xs font-normal">
                  Código para o suporte: {erro.correlacaoId}
                </span>
              )}
            </p>
          )}

          <button
            type="submit"
            disabled={entrar.isPending || !codigo || !senha}
            className="mt-2 rounded-lg bg-accent py-2.5 text-sm font-bold text-ink disabled:opacity-50"
          >
            {entrar.isPending ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div className="mt-6 text-center">
          {pedidoEnviado ? (
            <p className="text-xs text-suave">
              Pedido registrado. Procure o administrador para receber a nova senha.
            </p>
          ) : (
            <button
              type="button"
              className="text-xs font-semibold text-suave underline"
              onClick={() => {
                // A resposta é sempre a mesma, exista o código ou não — a tela
                // não pode virar um jeito de descobrir quais códigos existem.
                if (codigo.trim()) {
                  void fetch("/api/auth/solicitar-senha", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ codigo: codigo.trim() }),
                  });
                }
                setPedidoEnviado(true);
              }}
            >
              Esqueci minha senha
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
