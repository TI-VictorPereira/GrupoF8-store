import React, { useState } from "react";
import { useSession } from "@/lib/f8/session";
import { LogoF8 } from "@/components/f8/Logo";
import { solicitarNovaSenha } from "@/lib/f8/auth.functions";

export function LoginPage() {
  const { login } = useSession();
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pedindoSenha, setPedindoSenha] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setAviso("");
    setEnviando(true);
    const resultado = await login(codigo.trim(), senha.trim());
    setEnviando(false);
    if (!resultado.ok) setErro(resultado.erro ?? "Código ou senha inválidos.");
  }

  async function pedirSenha() {
    if (!codigo.trim()) {
      setErro("Informe seu código de acesso para pedir uma nova senha.");
      return;
    }
    setErro("");
    setPedindoSenha(true);
    await solicitarNovaSenha({ data: { codigo: codigo.trim() } });
    setPedindoSenha(false);
    setAviso("Pedido enviado. O administrador vai definir uma nova senha para você.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl overflow-hidden">
        <div className="bg-ink text-bg px-6 py-6">
          <LogoF8 className="w-12 h-12 mb-3" />
          <h1 className="font-bold text-base">Loja Interna</h1>
          <p className="text-bg/50 text-xs mt-1">Acesso único. Entre com seu código e senha.</p>
        </div>
        <form className="p-6" onSubmit={handleSubmit}>
          {erro && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-xs font-semibold rounded-lg px-3 py-2 mb-4">
              {erro}
            </div>
          )}
          {aviso && (
            <div className="bg-success/10 border border-success/30 text-success text-xs font-semibold rounded-lg px-3 py-2 mb-4">
              {aviso}
            </div>
          )}
          <label htmlFor="codigo" className="text-xs font-semibold text-muted-foreground">
            Código de acesso
          </label>
          <input
            id="codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2.5 text-sm mt-1 mb-3"
          />
          <label htmlFor="senha" className="text-xs font-semibold text-muted-foreground">
            Senha
          </label>
          <input
            id="senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2.5 text-sm mt-1 mb-5"
          />
          <button
            type="submit"
            disabled={enviando}
            className="w-full bg-accent text-ink font-bold rounded-xl py-3 text-sm disabled:opacity-60"
          >
            {enviando ? "Entrando…" : "Entrar"}
          </button>
          <button
            type="button"
            onClick={pedirSenha}
            disabled={pedindoSenha}
            className="w-full text-xs font-semibold text-muted-foreground mt-3 disabled:opacity-60"
          >
            {pedindoSenha ? "Enviando pedido…" : "Esqueci minha senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
