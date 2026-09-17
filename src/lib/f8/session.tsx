import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loginPorCodigo } from "./auth.functions";
import type { Colaborador, Sessao } from "./types";

interface SessionContextValue {
  sessao: Sessao | null;
  carregando: boolean;
  login: (codigo: string, senha: string) => Promise<{ ok: boolean; erro?: string | undefined }>;
  logout: () => Promise<void>;
  recarregar: () => Promise<void>;
}

const sessionContextRegistry = globalThis as typeof globalThis & {
  __grupoF8SessionContext?: React.Context<SessionContextValue | undefined>;
};

// Route chunks can be refreshed independently in development. Keeping the
// context in the global registry ensures providers and consumers always use
// the same instance, including immediately after a hot reload.
const SessionContext =
  sessionContextRegistry.__grupoF8SessionContext ??
  (sessionContextRegistry.__grupoF8SessionContext = createContext<SessionContextValue | undefined>(
    undefined,
  ));

const MENSAGENS_ERRO: Record<string, string> = {
  bloqueado: "Muitas tentativas erradas. Aguarde alguns minutos e tente novamente.",
  inativo: "Acesso inativo. Procure o RH ou o administrador.",
  invalido: "Código ou senha inválidos.",
  campos_obrigatorios: "Preencha código e senha.",
};

async function carregarPerfil(userId: string): Promise<Sessao | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  const colaborador = profile as unknown as Colaborador;
  return { papel: colaborador.papel, nome: colaborador.nome_completo, colaborador };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        const s = await carregarPerfil(data.session.user.id);
        if (ativo) setSessao(s);
      }
      if (ativo) setCarregando(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_evento, session) => {
      if (session?.user) {
        const s = await carregarPerfil(session.user.id);
        if (ativo) setSessao(s);
      } else if (ativo) {
        setSessao(null);
      }
    });

    return () => {
      ativo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (codigo: string, senha: string) => {
    if (!codigo || !senha) return { ok: false, erro: MENSAGENS_ERRO["campos_obrigatorios"] };

    try {
      const resultado = await loginPorCodigo({ data: { codigo, senha } });
      if (!resultado.ok) {
        return { ok: false, erro: MENSAGENS_ERRO[resultado.motivo] ?? MENSAGENS_ERRO["invalido"] };
      }
      const { data, error } = await supabase.auth.setSession({
        access_token: resultado.access_token,
        refresh_token: resultado.refresh_token,
      });

      if (error || !data.user) {
        return { ok: false, erro: MENSAGENS_ERRO["invalido"] };
      }

      const perfil = await carregarPerfil(data.user.id);
      if (!perfil) {
        await supabase.auth.signOut();
        return { ok: false, erro: MENSAGENS_ERRO["invalido"] };
      }

      setSessao(perfil);
      return { ok: true };
    } catch {
      return { ok: false, erro: MENSAGENS_ERRO["invalido"] };
    }
  }, []);

  const recarregar = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setSessao(null);
      return;
    }
    setSessao(await carregarPerfil(data.user.id));
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSessao(null);
  }, []);

  return (
    <SessionContext.Provider value={{ sessao, carregando, login, logout, recarregar }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession precisa estar dentro de <SessionProvider>");
  return ctx;
}
