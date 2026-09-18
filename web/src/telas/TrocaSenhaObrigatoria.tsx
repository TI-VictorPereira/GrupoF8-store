import { useState, type FormEvent } from "react";

import { ErroApi } from "@/api/cliente";
import { useTrocarSenha } from "@/comum/sessao";

const AVISOS: Record<string, string> = {
  senha_atual_incorreta: "A senha temporária não confere.",
  senha_fraca: "A senha é curta demais.",
  senha_repetida: "A senha nova precisa ser diferente da temporária.",
};

/**
 * Barreira do primeiro acesso.
 *
 * O servidor também recusa qualquer operação enquanto a senha for provisória —
 * esta tela é conveniência, não o controle de acesso.
 */
export function TrocaSenhaObrigatoria() {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const trocar = useTrocarSenha();

  const erro = trocar.error instanceof ErroApi ? trocar.error : null;
  const naoConfere = confirmacao.length > 0 && nova !== confirmacao;
  const aviso = naoConfere
    ? "As duas senhas não são iguais."
    : erro
      ? (AVISOS[erro.codigo] ?? erro.message)
      : null;

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (naoConfere) return;
    trocar.mutate({ senha_atual: atual, senha_nova: nova });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-bold">Defina sua senha</h1>
        <p className="mt-1 mb-6 text-sm text-suave">
          Você entrou com uma senha temporária. Escolha uma senha sua para continuar.
        </p>

        <form onSubmit={enviar} className="flex flex-col gap-3">
          {[
            { id: "atual", rotulo: "Senha temporária", valor: atual, definir: setAtual },
            { id: "nova", rotulo: "Nova senha", valor: nova, definir: setNova },
            {
              id: "confirmacao",
              rotulo: "Repita a nova senha",
              valor: confirmacao,
              definir: setConfirmacao,
            },
          ].map((campo) => (
            <div key={campo.id} className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-suave" htmlFor={campo.id}>
                {campo.rotulo}
              </label>
              <input
                id={campo.id}
                type="password"
                value={campo.valor}
                onChange={(e) => campo.definir(e.target.value)}
                className="rounded-lg border border-borda bg-card px-3 py-2.5 text-sm outline-none focus:border-ink"
              />
            </div>
          ))}

          {aviso && (
            <p className="rounded-lg border border-perigo/30 bg-perigo/10 px-3 py-2 text-sm font-medium text-perigo">
              {aviso}
            </p>
          )}

          <button
            type="submit"
            disabled={trocar.isPending || !atual || !nova || naoConfere}
            className="mt-2 rounded-lg bg-accent py-2.5 text-sm font-bold text-ink disabled:opacity-50"
          >
            {trocar.isPending ? "Salvando…" : "Salvar senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
