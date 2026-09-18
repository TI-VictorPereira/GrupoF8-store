import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { ErroApi, api } from "@/api/cliente";
import { Carregando } from "@/componentes/Carregando";
import { Vazio } from "@/componentes/Vazio";
import { hora } from "@/comum/formato";
import { useSair } from "@/comum/sessao";
import type { AlmocoDoDia } from "@/interfaces/almoco";
import type { ColaboradorParaAlmoco, LinhaPainel } from "@/interfaces/refeitorio";
import type { Eu } from "@/interfaces/sessao";

const CHAVE_PAINEL = ["painel-almocos"] as const;

const AVISOS: Record<string, string> = {
  codigo_barras_invalido: "Código não encontrado.",
  almoco_ja_confirmado: "Este código já foi usado hoje.",
  almoco_expirado: "Código expirado. Peça para gerar outro.",
  almoco_ja_gerado_hoje: "Esta pessoa já tem almoço lançado hoje.",
  nao_encontrado: "Colaborador não encontrado.",
};

interface Feedback {
  tom: "ok" | "erro";
  titulo: string;
  detalhe?: string;
}

type Filtro = "todos" | "pendente" | "confirmado";

export function PainelRefeitorio({ eu }: { eu: Eu }) {
  const clienteConsulta = useQueryClient();
  const sair = useSair();
  const campo = useRef<HTMLInputElement>(null);

  const [codigo, setCodigo] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [manualAberto, setManualAberto] = useState(false);
  const [termo, setTermo] = useState("");

  const painel = useQuery({
    queryKey: CHAVE_PAINEL,
    queryFn: () => api.get<LinhaPainel[]>("/almocos/hoje"),
    // Pode haver mais de um posto atendendo; recarregar de tempos em tempos
    // mantém a fila igual em todos sem ninguém apertar nada.
    refetchInterval: 10_000,
  });

  const busca = useQuery({
    queryKey: ["busca-colaborador", termo],
    queryFn: () =>
      api.get<ColaboradorParaAlmoco[]>(
        `/almocos/colaboradores?busca=${encodeURIComponent(termo)}`,
      ),
    enabled: manualAberto && termo.trim().length >= 2,
  });

  /** O nome não vem na resposta da confirmação; está na fila já carregada. */
  function nomeDe(almoco: AlmocoDoDia): string {
    const linhas = clienteConsulta.getQueryData<LinhaPainel[]>(CHAVE_PAINEL) ?? [];
    return linhas.find((l) => l.almoco.id === almoco.id)?.colaborador_nome ?? "Almoço liberado";
  }

  function recarregar() {
    void clienteConsulta.invalidateQueries({ queryKey: CHAVE_PAINEL });
  }

  const confirmar = useMutation({
    mutationFn: (codigo_barras: string) =>
      api.post<AlmocoDoDia>("/almocos/confirmar", { codigo_barras }),
    onSuccess: (almoco) => {
      setFeedback({ tom: "ok", titulo: nomeDe(almoco), detalhe: "Liberado" });
      recarregar();
    },
    onError: (erro) =>
      setFeedback({
        tom: "erro",
        titulo: erro instanceof ErroApi ? (AVISOS[erro.codigo] ?? erro.message) : "Falhou",
      }),
    onSettled: () => {
      setCodigo("");
      campo.current?.focus();
    },
  });

  const manual = useMutation({
    mutationFn: (colaborador_id: string) =>
      api.post<AlmocoDoDia>("/almocos/manual", { colaborador_id }),
    onSuccess: (almoco) => {
      recarregar();
      setFeedback({ tom: "ok", titulo: nomeDe(almoco), detalhe: "Lançado manualmente" });
      setManualAberto(false);
      setTermo("");
      campo.current?.focus();
    },
    onError: (erro) =>
      setFeedback({
        tom: "erro",
        titulo: erro instanceof ErroApi ? (AVISOS[erro.codigo] ?? erro.message) : "Falhou",
      }),
  });

  const desfazer = useMutation({
    mutationFn: (id: string) => api.post<AlmocoDoDia>(`/almocos/${id}/desfazer`),
    onSuccess: () => {
      recarregar();
      setFeedback({ tom: "ok", titulo: "Confirmação desfeita", detalhe: "Voltou para pendente" });
    },
  });

  // O aviso some sozinho: quem está no balcão não vai clicar para fechar, e um
  // "Liberado" parado na tela é o que faz a próxima pessoa passar sem conferir.
  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(id);
  }, [feedback]);

  const linhas = painel.data ?? [];
  const contagem = useMemo(
    () => ({
      total: linhas.length,
      pendente: linhas.filter((l) => l.almoco.status === "pendente").length,
      confirmado: linhas.filter((l) => l.almoco.status === "confirmado").length,
    }),
    [linhas],
  );
  const visiveis = filtro === "todos" ? linhas : linhas.filter((l) => l.almoco.status === filtro);

  function enviarCodigo(evento: FormEvent) {
    evento.preventDefault();
    const valor = codigo.trim();
    if (valor) confirmar.mutate(valor);
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-5 pb-10">
      <header className="flex items-center justify-between gap-3 py-5">
        <div>
          <h1 className="text-base font-bold">Refeitório</h1>
          <p className="text-xs text-suave">
            {contagem.confirmado} liberados · {contagem.pendente} aguardando
          </p>
        </div>
        <button onClick={() => sair.mutate()} className="text-xs font-semibold text-suave">
          Sair
        </button>
      </header>

      <form onSubmit={enviarCodigo} className="rounded-xl border border-borda bg-card p-4">
        <label htmlFor="codigo" className="text-xs font-semibold text-suave">
          Código de barras
        </label>
        <input
          id="codigo"
          ref={campo}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder="Passe o leitor ou digite"
          // O leitor de mão digita os dígitos e manda Enter no fim: o submit do
          // formulário já é o gatilho, sem botão nenhum no caminho.
          className="mt-1 w-full rounded-lg border border-borda px-3 py-3 font-mono text-xl tracking-wider outline-none focus:border-ink"
        />
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setManualAberto((v) => !v)}
            className="text-xs font-semibold text-suave underline"
          >
            {manualAberto ? "Fechar busca" : "Sem código? Lançar manualmente"}
          </button>
          <button
            type="submit"
            disabled={!codigo.trim() || confirmar.isPending}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {confirmar.isPending ? "Conferindo…" : "Confirmar"}
          </button>
        </div>
      </form>

      {feedback && (
        <div
          role="status"
          className={`mt-4 rounded-xl border px-5 py-4 ${
            feedback.tom === "ok"
              ? "border-sucesso/30 bg-sucesso/10"
              : "border-perigo/30 bg-perigo/10"
          }`}
        >
          <p
            className={`text-xl font-extrabold ${
              feedback.tom === "ok" ? "text-sucesso" : "text-perigo"
            }`}
          >
            {feedback.titulo}
          </p>
          {feedback.detalhe && <p className="text-sm text-suave">{feedback.detalhe}</p>}
        </div>
      )}

      {manualAberto && (
        <div className="mt-4 rounded-xl border border-borda bg-card p-4">
          <label htmlFor="busca" className="text-xs font-semibold text-suave">
            Nome ou código do colaborador
          </label>
          <input
            id="busca"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-borda px-3 py-2 text-sm outline-none focus:border-ink"
          />
          {termo.trim().length >= 2 && busca.data?.length === 0 && (
            <p className="mt-3 text-sm text-suave">Ninguém encontrado.</p>
          )}
          <div className="mt-2">
            {(busca.data ?? []).map((pessoa) => (
              <button
                key={pessoa.id}
                onClick={() => manual.mutate(pessoa.id)}
                disabled={manual.isPending}
                className="flex w-full items-center justify-between border-b border-borda py-2.5 text-left last:border-b-0 disabled:opacity-50"
              >
                <span>
                  <span className="block text-sm font-semibold">{pessoa.nome_completo}</span>
                  <span className="block text-[11px] text-suave">
                    {pessoa.codigo}
                    {pessoa.departamento ? ` · ${pessoa.departamento}` : ""}
                  </span>
                </span>
                <span className="text-xs font-bold text-suave">Lançar →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        {(
          [
            ["todos", `Todos (${contagem.total})`],
            ["pendente", `Aguardando (${contagem.pendente})`],
            ["confirmado", `Liberados (${contagem.confirmado})`],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            onClick={() => setFiltro(valor)}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
              filtro === valor ? "border-ink bg-ink text-white" : "border-borda bg-card text-suave"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-borda bg-card">
        {painel.isLoading && <Carregando />}
        {painel.data && visiveis.length === 0 && (
          <div className="p-4">
            <Vazio>Nada por aqui ainda hoje.</Vazio>
          </div>
        )}

        {visiveis.map(({ almoco, colaborador_nome, colaborador_codigo, departamento }) => (
          <div
            key={almoco.id}
            className="flex items-center justify-between gap-3 border-b border-borda px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{colaborador_nome}</p>
              <p className="truncate text-[11px] text-suave">
                {colaborador_codigo}
                {departamento ? ` · ${departamento}` : ""} · {hora(almoco.criado_em)}
                {almoco.origem === "manual" && " · manual"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {almoco.status === "confirmado" ? (
                <>
                  <span className="text-xs font-bold text-sucesso">
                    Liberado {almoco.confirmado_em ? hora(almoco.confirmado_em) : ""}
                  </span>
                  <button
                    onClick={() => desfazer.mutate(almoco.id)}
                    disabled={desfazer.isPending}
                    className="text-[11px] font-semibold text-suave underline disabled:opacity-50"
                  >
                    Desfazer
                  </button>
                </>
              ) : almoco.status === "pendente" ? (
                <span className="text-xs font-semibold text-suave">Aguardando</span>
              ) : (
                <span className="text-xs font-semibold text-muito-suave">{almoco.status}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {eu.papel === "admin" && (
        <p className="mt-4 text-center text-[11px] text-muito-suave">
          Você está no painel do refeitório como admin.
        </p>
      )}
    </div>
  );
}
