import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";

import { api } from "@/api/cliente";
import { Badge } from "@/componentes/ui/badge";
import { Button } from "@/componentes/ui/button";
import { cn } from "@/comum/utilitarios";
import { useSair } from "@/hooks/sessao";
import type { LinhaPedido } from "@/interfaces/admin";
import type { LinhaPainel } from "@/interfaces/refeitorio";
import type { Eu } from "@/interfaces/sessao";

const ABAS = [
  { para: "/admin/entregas", rotulo: "Entregas", contador: "pedidos" },
  { para: "/admin/almocos", rotulo: "Almoços", contador: "almocos" },
  { para: "/admin/estoque", rotulo: "Estoque" },
  { para: "/admin/vendas", rotulo: "Vendas" },
  { para: "/admin/colaboradores", rotulo: "Colaboradores" },
] as const;

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

  // Os dois números que fazem alguém abrir o admin: tem pedido para entregar?
  // tem gente esperando no refeitório? Ficam na navegação para não precisar
  // entrar em cada aba para descobrir.
  const { data: pendencias } = useQuery({
    queryKey: ["admin-pendencias"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const [pedidos, almocos] = await Promise.all([
        api.get<LinhaPedido[]>("/pedidos/pendentes"),
        api.get<LinhaPainel[]>("/almocos/hoje?status=pendente"),
      ]);
      return { pedidos: pedidos.length, almocos: almocos.length };
    },
  });

  const contadores: Record<string, number | undefined> = {
    pedidos: pendencias?.pedidos,
    almocos: pendencias?.almocos,
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-ink text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3">
          {/* A administração é um beco: as cinco abas navegam entre si e nada
              leva de volta ao início. O logo faz esse papel, como na maioria
              dos sistemas — clicar nele volta. */}
          <Link
            to="/"
            aria-label="Voltar ao início"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-black text-ink"
          >
            F8
          </Link>
          <span className="text-sm font-bold">Administração</span>

          <nav className="ml-6 hidden gap-1 md:flex">
            {ABAS.map((aba) => {
              const ativa = caminho.startsWith(aba.para);
              const contador = "contador" in aba ? contadores[aba.contador] : undefined;
              return (
                <Link
                  key={aba.para}
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
          <nav className="flex flex-col gap-1 border-t border-white/10 px-5 py-3 md:hidden">
            <Link
              to="/"
              onClick={() => setMenuAberto(false)}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-white/70"
            >
              ← Início
            </Link>
            {ABAS.map((aba) => (
              <Link
                key={aba.para}
                to={aba.para}
                onClick={() => setMenuAberto(false)}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-semibold",
                  caminho.startsWith(aba.para) ? "bg-accent text-ink" : "text-white/70",
                )}
              >
                {aba.rotulo}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-5 py-6">
        <Outlet />
      </main>
    </div>
  );
}
