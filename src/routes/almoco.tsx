import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Protegido } from "@/components/f8/Protegido";
import { ColabFrame, ColabSubHeader } from "@/components/f8/ColabShell";
import { Barcode } from "@/components/f8/Barcode";
import { useToast } from "@/components/f8/Toast";
import { hora } from "@/lib/f8/format";
import { useSession } from "@/lib/f8/session";
import type { Almoco } from "@/lib/f8/types";

export const Route = createFileRoute("/almoco")({
  head: () => ({
    meta: [
      { title: "Almoço — Loja Interna F8" },
      { name: "description", content: "Gere o código de barras do seu almoço do dia no Grupo F8." },
      { property: "og:title", content: "Almoço — Loja Interna F8" },
      {
        property: "og:description",
        content: "Gere o código de barras do seu almoço do dia no Grupo F8.",
      },
    ],
  }),
  component: () => (
    <Protegido papeis={["colaborador", "admin", "refeitorio"]}>
      <AlmocoPage />
    </Protegido>
  ),
});

function AlmocoPage() {
  const { sessao } = useSession();
  const { mostrar } = useToast();
  const navigate = useNavigate();
  const [almoco, setAlmoco] = useState<Almoco | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [restante, setRestante] = useState("");
  const [departamento, setDepartamento] = useState("");

  const buscar = useCallback(async () => {
    if (!sessao?.colaborador) return;
    const inicioDoDia = new Date();
    inicioDoDia.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("almocos")
      .select("*")
      .eq("colaborador_id", sessao.colaborador.id)
      .gte("criado_em", inicioDoDia.toISOString())
      .order("criado_em", { ascending: false })
      .limit(1);
    setAlmoco(((data ?? [])[0] as Almoco) ?? null);
    setCarregando(false);
  }, [sessao]);

  useEffect(() => {
    buscar();
  }, [buscar]);

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

  useEffect(() => {
    if (!almoco || almoco.status !== "pendente") return;
    const canal = supabase
      .channel("almoco-colaborador-" + almoco.id)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "almocos", filter: `id=eq.${almoco.id}` },
        (payload) => setAlmoco(payload.new as Almoco),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [almoco]);

  useEffect(() => {
    if (!almoco || almoco.status !== "pendente") return;
    const tick = () => {
      const ms = new Date(almoco.expira_em).getTime() - Date.now();
      if (ms <= 0) {
        setRestante("expirado");
        setAlmoco({ ...almoco, status: "expirado" });
        return;
      }
      const min = Math.floor(ms / 60000);
      const seg = Math.floor((ms % 60000) / 1000);
      setRestante(`${min}:${String(seg).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [almoco]);

  async function gerar() {
    setGerando(true);
    const { data, error } = await supabase.rpc("gerar_almoco", { p_validade_minutos: 15 });
    setGerando(false);
    if (error) {
      mostrar(error.message, "danger");
      return;
    }
    setAlmoco((Array.isArray(data) ? data[0] : data) as Almoco);
  }

  async function cancelar() {
    if (!almoco) return;
    await supabase.from("almocos").update({ status: "cancelado" }).eq("id", almoco.id);
    mostrar("Código de almoço cancelado.");
    navigate({ to: "/" });
  }

  const pendente = almoco?.status === "pendente";
  const confirmado = almoco?.status === "confirmado";

  return (
    <ColabFrame>
      <ColabSubHeader titulo="Almoço de hoje" />
      <div className="p-5 text-center">
        {carregando ? (
          <p className="text-sm text-muted-foreground py-6">Carregando…</p>
        ) : pendente || confirmado ? (
          <>
            <p className="text-xs text-muted-foreground mb-4">
              {sessao?.nome}
              {departamento ? ` · ${departamento}` : ""}
            </p>
            <Barcode valor={almoco!.codigo_barras} />
            {confirmado ? (
              <p className="text-sm text-success font-semibold mt-4">
                Já liberado{almoco?.confirmado_em ? ` às ${hora(almoco.confirmado_em)}` : ""}.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mt-4">
                  Mostre este código de barras ao responsável do refeitório para liberar a entrada.
                  Expira em <span className="font-bold text-ink">{restante}</span>
                </p>
                <button
                  onClick={cancelar}
                  className="text-xs font-semibold text-danger mt-4 block mx-auto"
                >
                  Cancelar código de hoje
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <p className="font-bold text-sm">
              {almoco?.status === "expirado" ? "Código expirado" : "Nenhum código hoje"}
            </p>
            <p className="text-xs text-muted-foreground mt-1 mb-5">
              Gere seu código de barras na hora de ir ao refeitório.
            </p>
            <button
              onClick={gerar}
              disabled={gerando}
              className="w-full bg-accent text-ink font-bold rounded-lg py-2.5 text-sm disabled:opacity-60"
            >
              {gerando ? "Gerando…" : "Liberar almoço de hoje"}
            </button>
          </>
        )}
      </div>
    </ColabFrame>
  );
}
