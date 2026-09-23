import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Menu, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/componentes/ui/badge";
import { Button } from "@/componentes/ui/button";
import { PAGINA_ADMIN } from "@/comum/layout";
import { ABAS_ADMIN } from "@/comum/navegacao";
import { cn } from "@/comum/utilitarios";
import { usePendencias } from "@/hooks/pendencias";
import { useSair } from "@/hooks/sessao";
import type { Eu } from "@/interfaces/sessao";

function iniciais(nome: string): string {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("");
}

export function MolduraAdmin({ eu }: { eu: Eu }) {
  const sair = useSair();
  const [menuAberto, setMenuAberto] = useState(false);
  const caminho = useRouterState({ select: (s) => s.location.pathname });
  const pendencias = usePendencias(eu.papel);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-ink text-white">
        <div className={cn(PAGINA_ADMIN, "flex items-center gap-3 py-3")}>
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label="Voltar ao início"
            className="text-white/70 hover:bg-white/10 hover:text-white"
          >
            <Link to="/">
              <ArrowLeft />
            </Link>
          </Button>
          <span className="text-sm font-bold">Administração</span>

          <nav className="ml-6 hidden gap-1 md:flex">
            {ABAS_ADMIN.map((aba) => {
              const ativa = caminho.startsWith(String(aba.para));
              const contador = aba.contador ? pendencias[aba.contador] : 0;
              return (
                <Link
                  key={aba.rotulo}
                  to={aba.para}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    ativa ? "bg-accent text-ink" : "text-white/70 hover:bg-white/10",
                  )}
                >
                  {aba.rotulo}
                  {!!contador && (
                    <Badge
                      className={cn(
                        "h-4 min-w-4 justify-center px-1 text-[10px]",
                        ativa ? "bg-ink text-accent" : "bg-accent text-ink",
                      )}
                    >
                      {contador}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span
              className="hidden h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold md:flex"
              title={eu.nome_completo}
            >
              {iniciais(eu.nome_completo)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => sair.mutate()}
              className="text-white/70 hover:bg-white/10 hover:text-white"
            >
              Sair
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Menu"
              onClick={() => setMenuAberto((v) => !v)}
              className="text-white/70 hover:bg-white/10 hover:text-white md:hidden"
            >
              {menuAberto ? <X /> : <Menu />}
            </Button>
          </div>
        </div>

        {menuAberto && (
          // Sem "← Início" aqui: a seta agora está sempre visível na barra, e
          // repetir o mesmo destino escondido atrás do menu é o que ensinava a
          // procurar o voltar no lugar errado.
          <nav className="flex flex-col gap-1 border-t border-white/10 px-5 py-3 md:hidden">
            {ABAS_ADMIN.map((aba) => (
              <Link
                key={aba.rotulo}
                to={aba.para}
                onClick={() => setMenuAberto(false)}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-semibold",
                  caminho.startsWith(String(aba.para)) ? "bg-accent text-ink" : "text-white/70",
                )}
              >
                {aba.rotulo}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className={cn(PAGINA_ADMIN, "py-6")}>
        <Outlet />
      </main>
    </div>
  );
}
