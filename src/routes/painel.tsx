import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Protegido } from "@/components/f8/Protegido";
import { LogoF8 } from "@/components/f8/Logo";
import { useToast } from "@/components/f8/Toast";
import { hora } from "@/lib/f8/format";
import { useSession } from "@/lib/f8/session";
import type { Almoco } from "@/lib/f8/types";

export const Route = createFileRoute("/painel")({
  head: () => ({
    meta: [
      { title: "Painel do Almoço — Loja Interna F8" },
      { name: "description", content: "Confirmação de almoços por leitura de código de barras." },
      { property: "og:title", content: "Painel do Almoço — Loja Interna F8" },
      {
        property: "og:description",
        content: "Confirmação de almoços por leitura de código de barras.",
      },
    ],
  }),
  component: () => (
    <Protegido papeis={["refeitorio", "admin"]}>
      <Painel />
    </Protegido>
  ),
});

interface LinhaAlmoco extends Almoco {
  profiles?: { nome_completo: string; codigo: string; departamento_id: string | null } | null;
}

type Feedback = { tipo: "ok" | "erro"; mensagem: string } | null;

function Painel() {
  const { mostrar } = useToast();
  const { sessao, logout } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [codigo, setCodigo] = useState("");
  const [busca, setBusca] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmados, setConfirmados] = useState<LinhaAlmoco[]>([]);
  const [pendentes, setPendentes] = useState<LinhaAlmoco[]>([]);
  const [departamentos, setDepartamentos] = useState<Record<string, string>>({});
  const [modalManual, setModalManual] = useState(false);
  const [colaboradores, setColaboradores] = useState<
    { id: string; nome_completo: string; codigo: string }[]
  >([]);
  const [selecionado, setSelecionado] = useState("");

  const carregar = useCallback(async () => {
    const inicioDoDia = new Date();
    inicioDoDia.setHours(0, 0, 0, 0);
    const select =
      "*, profiles!almocos_colaborador_id_fkey(nome_completo, codigo, departamento_id)";
    const [{ data: conf }, { data: pend }] = await Promise.all([
      supabase
        .from("almocos")
        .select(select)
        .eq("status", "confirmado")
        .gte("criado_em", inicioDoDia.toISOString())
        .order("confirmado_em", { ascending: false }),
      supabase
        .from("almocos")
        .select(select)
        .eq("status", "pendente")
        .gte("criado_em", inicioDoDia.toISOString())
        .order("criado_em", { ascending: false }),
    ]);
    setConfirmados((conf ?? []) as unknown as LinhaAlmoco[]);
    setPendentes((pend ?? []) as unknown as LinhaAlmoco[]);
  }, []);

  useEffect(() => {
    supabase
      .from("departamentos")
      .select("id, nome")
      .then(({ data }) => {
        const mapa: Record<string, string> = {};
        ((data ?? []) as { id: string; nome: string }[]).forEach((d) => (mapa[d.id] = d.nome));
        setDepartamentos(mapa);
      });
  }, []);

  useEffect(() => {
    carregar();
    inputRef.current?.focus();
    const canal = supabase
      .channel("painel-almocos")
      .on("postgres_changes", { event: "*", schema: "public", table: "almocos" }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregar]);

  async function confirmarPorCodigo(valor: string) {
    if (!valor.trim()) return;
    setConfirmando(true);
    const { error } = await supabase.rpc("confirmar_almoco", { p_codigo_barras: valor.trim() });
    setConfirmando(false);
    setCodigo("");
    inputRef.current?.focus();
    if (error) {
      setFeedback({ tipo: "erro", mensagem: error.message });
      return;
    }
    setFeedback({ tipo: "ok", mensagem: "Almoço liberado com sucesso." });
    carregar();
  }

  async function confirmarLinha(a: LinhaAlmoco) {
    const { error } = await supabase.rpc("confirmar_almoco", { p_codigo_barras: a.codigo_barras });
    if (error) {
      mostrar(error.message, "danger");
      return;
    }
    setFeedback({
      tipo: "ok",
      mensagem: `${a.profiles?.nome_completo ?? "Colaborador"} liberado com sucesso.`,
    });
    carregar();
  }

  async function desfazer(a: LinhaAlmoco) {
    const { error } = await supabase
      .from("almocos")
      .update({ status: "pendente", confirmado_em: null })
      .eq("id", a.id);
    if (error) {
      mostrar(error.message, "danger");
      return;
    }
    mostrar("Confirmação desfeita.");
    carregar();
  }

  async function abrirManual() {
    setModalManual(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, nome_completo, codigo")
      .eq("ativo", true)
      .eq("papel", "colaborador")
      .order("nome_completo");
    const lista = (data ?? []) as { id: string; nome_completo: string; codigo: string }[];
    setColaboradores(lista);
    setSelecionado(lista[0]?.id ?? "");
  }

  async function confirmarManual() {
    if (!selecionado) return;
    const { error } = await supabase.rpc("registrar_almoco_manual", {
      p_colaborador_id: selecionado,
    });
    if (error) {
      mostrar(error.message, "danger");
      return;
    }
    setModalManual(false);
    setFeedback({ tipo: "ok", mensagem: "Almoço registrado manualmente." });
    carregar();
  }

  const termo = busca.trim().toLowerCase();
  const pendentesFiltrados = pendentes.filter(
    (a) =>
      !termo ||
      (a.profiles?.nome_completo ?? "").toLowerCase().includes(termo) ||
      (a.profiles?.codigo ?? "").includes(termo),
  );

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-14 pb-10">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoF8 className="w-8 h-8 shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-sm leading-none">Painel do Almoço</p>
              <p className="text-muted-foreground text-[11px] mt-1 truncate">{sessao?.nome}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="text-xs font-semibold text-muted-foreground border border-border rounded-lg px-3 py-2 shrink-0"
          >
            Sair
          </button>
        </div>

        {feedback && (
          <div
            className={
              "border rounded-xl px-4 py-3 mb-4 text-sm font-semibold " +
              (feedback.tipo === "ok"
                ? "bg-success/10 border-success/30 text-success"
                : "bg-danger/10 border-danger/30 text-danger")
            }
          >
            {feedback.mensagem}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            confirmarPorCodigo(codigo);
          }}
          className="bg-ink rounded-2xl p-5 sm:p-6 mb-6"
        >
          <label
            htmlFor="scan"
            className="text-[11px] font-semibold text-bg/50 uppercase tracking-wide"
          >
            Leitor de código de barras
          </label>
          <input
            id="scan"
            ref={inputRef}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            autoComplete="off"
            inputMode="numeric"
            placeholder="Aponte o leitor para o código do colaborador"
            className="w-full bg-card rounded-xl px-4 py-4 text-base sm:text-lg font-bold mt-2 outline-none"
          />
          <button
            type="submit"
            disabled={confirmando}
            className="w-full bg-accent text-ink font-bold rounded-xl py-3 text-sm mt-3 disabled:opacity-60"
          >
            {confirmando ? "Confirmando…" : "Confirmar leitura"}
          </button>
          <p className="text-bg/40 text-[11px] mt-2">
            O campo fica sempre em foco. Basta ler o código, a liberação é automática.
          </p>
        </form>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
            <p className="text-xs text-muted-foreground font-medium">Pendentes agora</p>
            <p className="text-3xl font-bold mt-2">{pendentes.length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
            <p className="text-xs text-muted-foreground font-medium">Confirmados hoje</p>
            <p className="text-3xl font-bold mt-2 text-success">{confirmados.length}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou código"
            className="border border-border rounded-lg px-3 py-2.5 text-sm flex-1 bg-card"
          />
          <button
            onClick={abrirManual}
            className="text-xs font-semibold text-ink border border-border rounded-lg px-3 py-2.5 whitespace-nowrap bg-card"
          >
            Registrar manualmente
          </button>
        </div>

        <div className="flex flex-col gap-2 mb-8">
          {pendentesFiltrados.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
              Nenhuma confirmação pendente.
            </div>
          ) : (
            pendentesFiltrados.map((a) => (
              <div
                key={a.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border border-border rounded-xl p-3 bg-card"
              >
                <div className="min-w-0">
                  <p className="font-bold text-base truncate">
                    {a.profiles?.nome_completo ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {(a.profiles?.departamento_id
                      ? departamentos[a.profiles.departamento_id]
                      : null) ?? "Sem departamento"}{" "}
                    · {hora(a.criado_em)} · código {a.codigo_barras.slice(-6)}
                  </p>
                </div>
                <button
                  onClick={() => confirmarLinha(a)}
                  className="shrink-0 bg-accent text-ink font-bold rounded-lg px-4 sm:px-5 py-3 text-sm"
                >
                  Confirmar
                </button>
              </div>
            ))
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold mb-2 px-1">Confirmados hoje</h3>
          {confirmados.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1 py-3">Ninguém confirmado ainda.</p>
          ) : (
            confirmados.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 px-1 py-2 border-b border-border last:border-b-0"
              >
                <p className="flex-1 min-w-0 text-sm font-medium truncate">
                  {a.profiles?.nome_completo ?? "—"}
                </p>
                <span className="text-[11px] text-muted-soft shrink-0">
                  {a.confirmado_em ? hora(a.confirmado_em) : "—"}
                </span>
                <button
                  onClick={() => desfazer(a)}
                  className="text-[11px] font-semibold text-muted-foreground shrink-0"
                >
                  Desfazer
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {modalManual && (
        <div className="fixed inset-0 bg-ink/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6">
            <h3 className="font-bold text-lg mb-1">Registrar almoço manualmente</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Use quando o colaborador não gerou o código no celular.
            </p>
            <label htmlFor="manual" className="text-xs font-semibold text-muted-foreground">
              Colaborador
            </label>
            <select
              id="manual"
              value={selecionado}
              onChange={(e) => setSelecionado(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm mt-1 mb-5 bg-card"
            >
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome_completo} · {c.codigo}
                </option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setModalManual(false)}
                className="text-sm font-semibold border border-border rounded-lg px-4 py-2.5"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarManual}
                className="text-sm font-bold bg-accent text-ink rounded-lg px-4 py-2.5"
              >
                Confirmar almoço
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
