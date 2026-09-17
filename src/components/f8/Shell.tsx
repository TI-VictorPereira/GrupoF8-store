import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useSession } from "@/lib/f8/session";
import { LogoF8 } from "@/components/f8/Logo";

export function Shell({
  titulo,
  subtitulo,
  voltar,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  voltar?: string;
  children: ReactNode;
}) {
  const { sessao, logout } = useSession();

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-ink text-bg">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <LogoF8 />

          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm truncate">{titulo}</h1>
            {subtitulo && <p className="text-bg/50 text-xs truncate">{subtitulo}</p>}
          </div>
          {voltar && (
            <Link to={voltar} className="text-xs font-semibold text-bg/70">
              Voltar
            </Link>
          )}
          {sessao && (
            <button onClick={logout} className="text-xs font-semibold text-bg/70">
              Sair
            </button>
          )}
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-5">{children}</main>
    </div>
  );
}
