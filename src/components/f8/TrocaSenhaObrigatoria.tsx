import React, { useState } from "react";
import { useSession } from "@/lib/f8/session";
import { LogoF8 } from "@/components/f8/Logo";
import { trocarSenhaPropria } from "@/lib/f8/auth.functions";

export function TrocaSenhaObrigatoria() {
  const { sessao, logout, recarregar } = useSession();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (senha.length < 6) {
      setErro("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (senha !== confirmacao) {
      setErro("As senhas não são iguais.");
      return;
    }
    setSalvando(true);
    const resultado = await trocarSenhaPropria({ data: { senha } });
    setSalvando(false);
    if (!resultado.ok) {
      setErro("Não foi possível salvar a nova senha. Tente novamente.");
      return;
    }
    await recarregar();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl overflow-hidden">
        <div className="bg-ink text-bg px-6 py-6">
          <LogoF8 className="w-12 h-12 mb-3" />
          <h1 className="font-bold text-base">Crie sua senha</h1>
          <p className="text-bg/50 text-xs mt-1">
            {sessao?.nome ? `${sessao.nome}, ` : ""}este é seu primeiro acesso. Defina uma senha
            pessoal para continuar.
          </p>
        </div>
        <form className="p-6" onSubmit={handleSubmit}>
          {erro && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-xs font-semibold rounded-lg px-3 py-2 mb-4">
              {erro}
            </div>
          )}
          <label htmlFor="nova-senha" className="text-xs font-semibold text-muted-foreground">
            Nova senha
          </label>
          <input
            id="nova-senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2.5 text-sm mt-1 mb-3"
          />
          <label htmlFor="confirmar-senha" className="text-xs font-semibold text-muted-foreground">
            Repita a nova senha
          </label>
          <input
            id="confirmar-senha"
            type="password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2.5 text-sm mt-1 mb-5"
          />
          <button
            type="submit"
            disabled={salvando}
            className="w-full bg-accent text-ink font-bold rounded-xl py-3 text-sm disabled:opacity-60"
          >
            {salvando ? "Salvando…" : "Salvar e continuar"}
          </button>
          <button
            type="button"
            onClick={logout}
            className="w-full text-xs font-semibold text-muted-foreground mt-3"
          >
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}

export function ExigeTrocaSenha({ children }: { children: React.ReactNode }) {
  const { sessao } = useSession();
  if (sessao?.colaborador?.senha_provisoria) return <TrocaSenhaObrigatoria />;
  return <>{children}</>;
}
