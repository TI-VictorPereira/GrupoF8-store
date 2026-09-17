import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Protegido } from "@/components/f8/Protegido";
import { LogoF8 } from "@/components/f8/Logo";
import { useSession } from "@/lib/f8/session";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  component: () => (
    <Protegido papeis={["admin"]}>
      <AdminLayout />
    </Protegido>
  ),
});

const ABAS: { to: string; label: string; badge?: "pedidos" | "almocos" }[] = [
  { to: "/admin/entregas", label: "Entregas", badge: "pedidos" },
  { to: "/admin/almocos", label: "Almoços", badge: "almocos" },
  { to: "/admin/estoque", label: "Estoque" },
  { to: "/admin/vendas", label: "Vendas" },
  { to: "/admin/colaboradores", label: "Colaboradores" },
];

function iniciais(nome?: string | null) {
  if (!nome) return "AD";
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

async function exportarTudo() {
  const XLSX = await import("xlsx");
  const [{ data: produtos }, { data: pedidos }, { data: perfis }, { data: almocos }] =
    await Promise.all([
      supabase.from("produtos").select("*"),
      supabase.from("pedidos").select("*, itens_pedido(*)"),
      supabase.from("profiles").select("*"),
      supabase.from("almocos").select("*"),
    ]);
  const pasta = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pasta, XLSX.utils.json_to_sheet(produtos ?? []), "Produtos");
  XLSX.utils.book_append_sheet(pasta, XLSX.utils.json_to_sheet(pedidos ?? []), "Pedidos");
  XLSX.utils.book_append_sheet(pasta, XLSX.utils.json_to_sheet(perfis ?? []), "Colaboradores");
  XLSX.utils.book_append_sheet(pasta, XLSX.utils.json_to_sheet(almocos ?? []), "Almocos");
  XLSX.writeFile(pasta, `loja-interna-f8-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function AdminLayout() {
  const { sessao, logout } = useSession();
  const [menuAberto, setMenuAberto] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const atual = ABAS.find((a) => pathname.startsWith(a.to));

  const { data: contagens } = useQuery({
    queryKey: ["admin-badges"],
    refetchInterval: 15000,
    queryFn: async () => {
      const inicioDia = new Date();
      inicioDia.setHours(0, 0, 0, 0);
      const [pedidos, almocos] = await Promise.all([
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .eq("status", "pendente"),
        supabase
          .from("almocos")
          .select("id", { count: "exact", head: true })
          .eq("status", "pendente")
          .gte("criado_em", inicioDia.toISOString()),
      ]);
      return { pedidos: pedidos.count ?? 0, almocos: almocos.count ?? 0 };
    },
  });

  return (
    <div className="min-h-screen bg-bg md:flex">
      {menuAberto && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-ink/50 md:hidden"
          onClick={() => setMenuAberto(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[min(82vw,280px)] flex-col bg-ink p-4 transition-transform duration-200 md:static md:min-h-screen md:w-60 md:shrink-0 md:translate-x-0",
          menuAberto ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2.5 px-1 pb-5 mb-4 border-b border-bg/10">
          <LogoF8 className="w-8 h-8" />
          <div className="min-w-0 flex-1">
            <p className="text-bg font-semibold text-sm leading-none">Loja Interna</p>
            <p className="text-bg/40 text-[11px] mt-1">Painel administrativo</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Fechar menu"
            className="text-bg hover:bg-bg/10 hover:text-bg md:hidden"
            onClick={() => setMenuAberto(false)}
          >
            <X />
          </Button>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {ABAS.map((aba) => {
            const badge =
              aba.badge === "pedidos"
                ? contagens?.pedidos
                : aba.badge === "almocos"
                  ? contagens?.almocos
                  : 0;
            return (
              <Link
                key={aba.to}
                to={aba.to}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium flex items-center justify-between"
                activeProps={{ className: "bg-accent text-ink" }}
                inactiveProps={{ className: "text-bg/75 hover:bg-bg/10 hover:text-bg" }}
                onClick={() => setMenuAberto(false)}
              >
                <span>{aba.label}</span>
                {!!badge && (
                  <span className="bg-danger text-bg text-[10px] font-bold rounded-full px-1.5 py-0.5">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <Link
          to="/painel"
          className="text-bg/50 hover:text-bg text-xs font-semibold px-3 py-2"
          onClick={() => setMenuAberto(false)}
        >
          Painel do refeitório
        </Link>
        <Link
          to="/colaborador"
          className="text-bg/50 hover:text-bg text-xs font-semibold px-3 py-2"
          onClick={() => setMenuAberto(false)}
        >
          Área do colaborador
        </Link>
        <button
          onClick={logout}
          className="text-bg/50 hover:text-bg text-xs font-semibold px-3 py-2 text-left"
        >
          Sair
        </button>
      </aside>

      <main className="min-h-screen min-w-0 flex-1">
        <header className="sticky top-0 z-20 grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-card px-3 py-2 sm:px-8">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Abrir menu"
            className="md:hidden"
            onClick={() => setMenuAberto(true)}
          >
            <Menu />
          </Button>
          <div className="min-w-0 text-sm font-medium text-muted-foreground">
            <span className="hidden font-semibold text-ink sm:inline">Loja Interna / </span>
            <span className="block truncate text-base font-semibold text-ink sm:inline sm:text-sm">
              {atual?.label ?? "Administração"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Button
              onClick={exportarTudo}
              size="icon"
              className="bg-accent text-ink hover:bg-accent/90 sm:w-auto sm:px-3"
              aria-label="Exportar tudo em Excel"
            >
              <Download />
              <span className="hidden sm:inline">Exportar tudo (Excel)</span>
            </Button>
            <div className="hidden items-center gap-2 rounded-lg border border-border bg-bg py-1 pl-1 pr-3 sm:flex">
              <div className="w-6 h-6 rounded-full bg-border flex items-center justify-center text-[10px] font-bold">
                {iniciais(sessao?.nome)}
              </div>
              <span className="text-xs font-medium">{sessao?.nome ?? "Administrador"}</span>
            </div>
          </div>
        </header>

        <div className="max-w-[1200px] p-4 sm:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
