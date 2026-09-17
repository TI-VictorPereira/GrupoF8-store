import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/f8/session";
import { LoginPage } from "@/components/f8/LoginPage";
import { ColabFrame } from "@/components/f8/ColabShell";
import { LogoF8 } from "@/components/f8/Logo";
import { fmt, hora, mesmoMes } from "@/lib/f8/format";
import type { Almoco, Pedido } from "@/lib/f8/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Loja Interna F8 — Acesso" },
      {
        name: "description",
        content: "Compre na loja interna, gere seu código de almoço e acompanhe seu consumo.",
      },
      { property: "og:title", content: "Loja Interna F8 — Acesso" },
      {
        property: "og:description",
        content: "Compre na loja interna, gere seu código de almoço e acompanhe seu consumo.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { sessao, carregando } = useSession();

  if (carregando) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!sessao) return <LoginPage />;
  if (sessao.papel === "admin") return <Navigate to="/admin/entregas" replace />;
  if (sessao.papel === "refeitorio") return <Navigate to="/painel" replace />;

  return <ColaboradorHome />;
}

export function ColaboradorHome() {
  const { sessao, logout } = useSession();
  const navigate = useNavigate();
  const [almocoHoje, setAlmocoHoje] = useState<Almoco | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [almocos, setAlmocos] = useState<Almoco[]>([]);
  const [gerando, setGerando] = useState(false);
  const [departamento, setDepartamento] = useState("");

  const colaboradorId = sessao?.colaborador?.id;

  const carregar = useCallback(async () => {
    if (!colaboradorId) return;
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const [{ data: alm }, { data: peds }] = await Promise.all([
      supabase
        .from("almocos")
        .select("*")
        .eq("colaborador_id", colaboradorId)
        .gte("criado_em", inicioMes.toISOString())
        .order("criado_em", { ascending: false }),
      supabase
        .from("pedidos")
        .select("*")
        .eq("colaborador_id", colaboradorId)
        .gte("criado_em", inicioMes.toISOString()),
    ]);
    const listaAlmocos = (alm ?? []) as unknown as Almoco[];
    setAlmocos(listaAlmocos);
    setPedidos((peds ?? []) as unknown as Pedido[]);
    setAlmocoHoje(
      listaAlmocos.find(
        (a) =>
          new Date(a.criado_em) >= inicioDia &&
          (a.status === "pendente" || a.status === "confirmado"),
      ) ?? null,
    );
  }, [colaboradorId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const depId = sessao?.colaborador?.departamento_id;
    if (!depId) return;
    supabase
      .from("departamentos")
      .select("nome")
      .eq("id", depId)
      .maybeSingle()
      .then(({ data }) => setDepartamento((data as { nome: string } | null)?.nome ?? ""));
  }, [sessao]);

  async function gerarAlmoco() {
    if (almocoHoje) {
      navigate({ to: "/almoco" });
      return;
    }
    setGerando(true);
    await supabase.rpc("gerar_almoco", { p_validade_minutos: 15 });
    setGerando(false);
    navigate({ to: "/almoco" });
  }

  const gastoMes = pedidos
    .filter((p) => p.status !== "cancelado" && mesmoMes(p.criado_em))
    .reduce((s, p) => s + Number(p.valor_total), 0);
  const almocosMes = almocos.filter((a) => a.status !== "cancelado" && mesmoMes(a.criado_em)).length;

  const primeiroNome = (sessao?.nome ?? "").split(" ")[0];

  return (
    <ColabFrame>
      <div className="bg-ink text-bg px-5 pt-6 pb-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <LogoF8 />
          <div>
            <p className="font-semibold text-sm leading-none">Olá, {primeiroNome}</p>
            <p className="text-bg/50 text-[11px] mt-1">
              {departamento || "Sem departamento"} · {sessao?.colaborador?.empresa ?? "Grupo F8"}
            </p>
          </div>
        </div>
        <button onClick={logout} className="text-bg/50 text-[11px] font-semibold shrink-0 mt-0.5">
          Sair
        </button>
      </div>

      <div className="p-5 flex flex-col gap-4">
        <div className="border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold mb-2">Almoço de hoje</h3>
          {!almocoHoje ? (
            <>
              <p className="text-sm text-muted-foreground mb-3">
                Você ainda não liberou o almoço de hoje.
              </p>
              <button
                onClick={gerarAlmoco}
                disabled={gerando}
                className="w-full bg-accent text-ink font-bold rounded-lg py-2.5 text-sm disabled:opacity-60"
              >
                {gerando ? "Gerando…" : "Liberar almoço de hoje"}
              </button>
            </>
          ) : almocoHoje.status === "confirmado" ? (
            <>
              <p className="text-sm text-success font-semibold mb-1">
                Almoço já liberado
                {almocoHoje.confirmado_em ? ` às ${hora(almocoHoje.confirmado_em)}` : ""}.
              </p>
              <p className="text-xs text-muted-foreground">Confirmado no refeitório.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-3">
                Código gerado às {hora(almocoHoje.criado_em)}. Aguardando leitura no refeitório.
              </p>
              <button
                onClick={() => navigate({ to: "/almoco" })}
                className="w-full border border-border font-bold rounded-lg py-2.5 text-sm"
              >
                Ver código de barras
              </button>
            </>
          )}
        </div>

        <div className="border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold mb-2">Loja interna</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Energéticos, refrigerantes, água com gás e picolés.
          </p>
          <button
            onClick={() => navigate({ to: "/loja" })}
            className="w-full bg-accent text-ink font-bold rounded-lg py-2.5 text-sm"
          >
            Comprar itens
          </button>
        </div>

        <div className="border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold">Meu consumo</h3>
            <button
              onClick={() => navigate({ to: "/consumo" })}
              className="text-xs font-semibold text-muted-foreground"
            >
              Ver tudo →
            </button>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Gasto na loja este mês</span>
            <span className="font-bold">{fmt(gastoMes)}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-muted-foreground">Almoços este mês</span>
            <span className="font-bold">{almocosMes}</span>
          </div>
        </div>
      </div>
    </ColabFrame>
  );
}
