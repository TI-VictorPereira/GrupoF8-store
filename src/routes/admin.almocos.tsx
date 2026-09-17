import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/f8/Toast";
import { hora, horaFmt } from "@/lib/f8/format";
import { exportarPlanilha } from "@/lib/f8/exportar";
import type { Almoco } from "@/lib/f8/types";

export const Route = createFileRoute("/admin/almocos")({
  component: AdminAlmocos,
});

type Linha = Almoco & {
  profiles?: {
    nome_completo: string;
    codigo: string;
    departamentos?: { nome: string } | null;
  } | null;
};

function AdminAlmocos() {
  const { mostrar } = useToast();
  const hoje = new Date().toISOString().slice(0, 10);
  const [data_, setData] = useState(hoje);
  const [dataFim, setDataFim] = useState(hoje);
  const [departamento, setDepartamento] = useState("");
  const [departamentos, setDepartamentos] = useState<{ id: string; nome: string }[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const fimData = dataFim && dataFim >= data_ ? dataFim : data_;
    const inicio = new Date(`${data_}T00:00:00`);
    const fim = new Date(`${fimData}T23:59:59`);
    const { data } = await supabase
      .from("almocos")
      .select(
        "*, profiles!almocos_colaborador_id_fkey(nome_completo, codigo, departamentos(nome))",
      )
      .gte("criado_em", inicio.toISOString())
      .lte("criado_em", fim.toISOString())
      .order("criado_em", { ascending: false });
    setLinhas((data ?? []) as unknown as Linha[]);
    setCarregando(false);
  }, [data_, dataFim]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    supabase
      .from("departamentos")
      .select("id, nome")
      .order("nome")
      .then(({ data }) => setDepartamentos(data ?? []));
  }, []);

  async function confirmar(l: Linha) {
    const { error } = await supabase
      .from("almocos")
      .update({ status: "confirmado", confirmado_em: new Date().toISOString() })
      .eq("id", l.id);
    if (error) mostrar(error.message, "danger");
    else {
      mostrar("Almoço confirmado.");
      carregar();
    }
  }

  async function desfazer(l: Linha) {
    const { error } = await supabase
      .from("almocos")
      .update({ status: "pendente", confirmado_em: null })
      .eq("id", l.id);
    if (error) mostrar(error.message, "danger");
    else {
      mostrar("Confirmação desfeita.");
      carregar();
    }
  }

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      const combinaBusca =
        !termo ||
        (l.profiles?.nome_completo ?? "").toLowerCase().includes(termo) ||
        (l.codigo_barras ?? "").toLowerCase().includes(termo);
      const combinaDep =
        !departamento || (l.profiles?.departamentos?.nome ?? "") === departamento;
      return combinaBusca && combinaDep;
    });
  }, [linhas, busca, departamento]);

  const pendentes = filtradas.filter((l) => l.status === "pendente");
  const confirmados = filtradas.filter((l) => l.status === "confirmado");

  async function exportar() {
    const linhas = filtradas.map((l) => ({
      Data: l.criado_em.slice(0, 10),
      Colaborador: l.profiles?.nome_completo ?? "—",
      "Código do colaborador": l.profiles?.codigo ?? "—",
      Departamento: l.profiles?.departamentos?.nome ?? "—",
      Status: l.status,
      Origem: l.origem,
      "Código de barras": l.codigo_barras,
      "Gerado em": horaFmt(l.criado_em),
      "Confirmado em": l.confirmado_em ? horaFmt(l.confirmado_em) : "—",
    }));
    await exportarPlanilha(`almocos-f8-${data_}_a_${dataFim}`, [{ nome: "Almoços", linhas }]);
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted-foreground font-medium">Pendentes agora</p>
          <p className="text-3xl font-bold mt-2">{pendentes.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted-foreground font-medium">Concluídos no dia</p>
          <p className="text-3xl font-bold mt-2 text-success">{confirmados.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between mb-3 gap-3">
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-4 sm:items-center">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou código"
            className="border border-border rounded-lg px-3 py-2 text-sm w-full bg-card"
          />
          <input
            type="date"
            aria-label="Data inicial"
            value={data_}
            onChange={(e) => setData(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-card w-full"
          />
          <input
            type="date"
            aria-label="Data final"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-card w-full"
          />
          <select
            value={departamento}
            onChange={(e) => setDepartamento(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-card w-full"
          >
            <option value="">Todos os departamentos</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.nome}>
                {d.nome}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={exportar}
          className="text-xs font-semibold text-ink border border-border rounded-lg px-3 py-2 bg-card w-full sm:w-auto"
        >
          Exportar almoços (Excel)
        </button>
        <p className="text-[11px] text-muted-foreground w-full sm:w-auto">
          A leitura do código de barras no Painel do Almoço já marca como concluído na hora.
        </p>
      </div>

      {/* Lista em cartões (celular) */}
      <div className="space-y-2 md:hidden">
        {carregando ? (
          <div className="bg-card border border-border rounded-xl p-5 text-center text-muted-foreground text-sm">
            Carregando…
          </div>
        ) : filtradas.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-5 text-center text-muted-foreground text-sm">
            Nenhum almoço registrado nesta data.
          </div>
        ) : (
          [...pendentes, ...confirmados].map((l) => {
            const expirado =
              l.status === "pendente" && new Date(l.expira_em) <= new Date();
            return (
              <div key={l.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">
                      {l.profiles?.nome_completo ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {l.profiles?.departamentos?.nome ?? "—"} ·{" "}
                      {hora(l.confirmado_em ?? l.criado_em)}
                    </p>
                  </div>
                  {l.status === "confirmado" ? (
                    <span className="shrink-0 text-[11px] font-bold text-success bg-success/10 rounded-full px-2 py-0.5">
                      Concluído
                    </span>
                  ) : expirado ? (
                    <span className="shrink-0 text-[11px] font-bold text-danger bg-danger/10 rounded-full px-2 py-0.5">
                      Expirado
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] font-bold text-accent-foreground bg-accent/20 rounded-full px-2 py-0.5">
                      Pendente
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  {l.status === "confirmado" ? (
                    <button
                      onClick={() => desfazer(l)}
                      className="w-full text-sm font-semibold text-muted-foreground border border-border rounded-lg py-2"
                    >
                      Desfazer
                    </button>
                  ) : (
                    <button
                      onClick={() => confirmar(l)}
                      className="w-full text-sm font-bold text-ink bg-accent rounded-lg py-2"
                    >
                      Confirmar
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="hidden md:block bg-card border border-border rounded-xl p-4 overflow-x-auto">
        <table className="w-full text-sm admin-table">

          <thead>
            <tr className="text-left border-b border-border">
              <th className="py-2 pr-3">Colaborador</th>
              <th className="py-2 pr-3">Departamento</th>
              <th className="py-2 pr-3">Horário</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            ) : filtradas.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                  Nenhum almoço registrado nesta data.
                </td>
              </tr>
            ) : (
              [...pendentes, ...confirmados].map((l) => {
                const expirado =
                  l.status === "pendente" && new Date(l.expira_em) <= new Date();
                return (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3 font-semibold">
                      {l.profiles?.nome_completo ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3">{l.profiles?.departamentos?.nome ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">
                      {hora(l.confirmado_em ?? l.criado_em)}
                    </td>
                    <td className="py-2.5 pr-3">
                      {l.status === "confirmado" ? (
                        <span className="text-[11px] font-bold text-success bg-success/10 rounded-full px-2 py-0.5">
                          Concluído
                        </span>
                      ) : expirado ? (
                        <span className="text-[11px] font-bold text-danger bg-danger/10 rounded-full px-2 py-0.5">
                          Expirado
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-accent-foreground bg-accent/20 rounded-full px-2 py-0.5">
                          Pendente
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      {l.status === "confirmado" ? (
                        <button
                          onClick={() => desfazer(l)}
                          className="text-xs font-semibold text-muted-foreground"
                        >
                          Desfazer
                        </button>
                      ) : (
                        <button
                          onClick={() => confirmar(l)}
                          className="text-xs font-semibold text-ink border border-border rounded-lg px-2.5 py-1.5"
                        >
                          Confirmar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
