import type { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { useSession } from "@/lib/f8/session";

import type { PapelUsuario } from "@/lib/f8/types";

export function Protegido({ papeis, children }: { papeis: PapelUsuario[]; children: ReactNode }) {
  const { sessao, carregando } = useSession();

  if (carregando) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  // O login acontece sempre na raiz, que encaminha cada perfil para a sua tela.
  if (!sessao) return <Navigate to="/" replace />;

  if (!papeis.includes(sessao.papel)) {
    if (sessao.papel === "refeitorio") return <Navigate to="/painel" replace />;
    if (sessao.papel === "admin") return <Navigate to="/admin/entregas" replace />;
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
