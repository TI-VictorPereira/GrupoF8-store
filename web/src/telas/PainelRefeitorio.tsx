import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { api } from "@/api/cliente";
import { BuscarColaborador } from "@/componentes/BuscarColaborador";
import { Carregando } from "@/componentes/Carregando";
import { Vazio } from "@/componentes/Vazio";
import { Badge } from "@/componentes/ui/badge";
import { Button } from "@/componentes/ui/button";
import { Card, CardContent } from "@/componentes/ui/card";
import { Input } from "@/componentes/ui/input";
import { Label } from "@/componentes/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/componentes/ui/tabs";
import { mensagemDeErro } from "@/comum/erros";
import { hora } from "@/comum/formato";
import { PAGINA_PAINEL } from "@/comum/layout";
import { cn } from "@/comum/utilitarios";
import { useSair } from "@/hooks/sessao";
import type { AlmocoDoDia } from "@/interfaces/almoco";
import type { LinhaPainel } from "@/interfaces/refeitorio";
import type { Eu } from "@/interfaces/sessao";

const CHAVE_PAINEL = ["painel-almocos"] as const;


const AVISOS: Record<string, string> = {
  almoco_ja_confirmado: "Este código já foi usado hoje.",
  almoco_expirado: "Código expirado. Peça para gerar outro.",
  almoco_ja_gerado_hoje: "Esta pessoa já tem almoço lançado hoje.",
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

  const painel = useQuery({
    queryKey: CHAVE_PAINEL,
    queryFn: () => api.get<LinhaPainel[]>("/almocos/hoje"),
    // Pode haver mais de um posto atendendo; recarregar de tempos em tempos
    // mantém a fila igual em todos sem ninguém apertar nada.
    refetchInterval: 10_000,
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
    onError: (erro) => setFeedback({ tom: "erro", titulo: mensagemDeErro(erro, AVISOS) }),
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
      campo.current?.focus();
    },
    onError: (erro) => setFeedback({ tom: "erro", titulo: mensagemDeErro(erro, AVISOS) }),
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

  // Depende de `painel.data` e não de `linhas`: `?? []` cria um array novo a
  // cada render, então a dependência mudava sempre e o memo não memorizava
  // nada. Foi o ESLint que apontou.
  const linhas = painel.data ?? [];
  const contagem = useMemo(
    () => ({
      todos: painel.data?.length ?? 0,
      pendente: (painel.data ?? []).filter((l) => l.almoco.status === "pendente").length,
      confirmado: (painel.data ?? []).filter((l) => l.almoco.status === "confirmado").length,
    }),
    [painel.data],
  );
  const visiveis = filtro === "todos" ? linhas : linhas.filter((l) => l.almoco.status === filtro);

  function enviarCodigo(evento: FormEvent) {
    evento.preventDefault();
    const valor = codigo.trim();
    if (valor) confirmar.mutate(valor);
  }

  return (
    <div className={cn(PAGINA_PAINEL, "min-h-screen pb-10")}>
      <header className="flex items-center gap-3 py-5">
        <Button asChild variant="ghost" size="icon" aria-label="Voltar ao início">
          <Link to="/">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="text-base font-bold">Refeitório</h1>
          <p className="text-xs text-suave">
            {contagem.confirmado} liberados · {contagem.pendente} aguardando
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => sair.mutate()}
          className="ml-auto"
        >
          Sair
        </Button>
      </header>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={enviarCodigo}>
            <Label htmlFor="codigo">Código de barras</Label>
            <Input
              id="codigo"
              ref={campo}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="Passe o leitor ou digite"
              // O leitor de mão digita os dígitos e manda Enter no fim: o
              // submit do formulário já é o gatilho, sem botão no caminho.
              className="mt-1.5 h-12 font-mono text-xl tracking-wider"
            />
            <div className="mt-3 flex items-center justify-between">
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-suave"
                onClick={() => setManualAberto((v) => !v)}
              >
                {manualAberto ? "Fechar busca" : "Sem código? Lançar manualmente"}
              </Button>
              <Button type="submit" disabled={!codigo.trim() || confirmar.isPending}>
                {confirmar.isPending ? "Conferindo…" : "Confirmar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {feedback && (
        <Card
          role="status"
          className={`mt-4 ${
            feedback.tom === "ok"
              ? "border-sucesso/30 bg-sucesso/10"
              : "border-perigo/30 bg-perigo/10"
          }`}
        >
          <CardContent className="flex items-center gap-3 p-4">
            {feedback.tom === "ok" ? (
              <CheckCircle2 className="size-8 shrink-0 text-sucesso" />
            ) : (
              <XCircle className="size-8 shrink-0 text-perigo" />
            )}
            <div className="min-w-0">
              <p
                className={`truncate text-xl font-extrabold ${
                  feedback.tom === "ok" ? "text-sucesso" : "text-perigo"
                }`}
              >
                {feedback.titulo}
              </p>
              {feedback.detalhe && <p className="text-sm text-suave">{feedback.detalhe}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {manualAberto && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <BuscarColaborador
              acao="Lançar"
              ocupado={manual.isPending}
              aoEscolher={(pessoa) => manual.mutate(pessoa.id)}
            />
          </CardContent>
        </Card>
      )}

      <Tabs
        value={filtro}
        onValueChange={(v) => setFiltro(v as Filtro)}
        className="mt-6"
      >
        <TabsList>
          <TabsTrigger value="todos">Todos ({contagem.todos})</TabsTrigger>
          <TabsTrigger value="pendente">Aguardando ({contagem.pendente})</TabsTrigger>
          <TabsTrigger value="confirmado">Liberados ({contagem.confirmado})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="mt-3 overflow-hidden">
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
            <div className="flex shrink-0 items-center gap-2">
              {almoco.status === "confirmado" ? (
                <>
                  <Badge className="bg-sucesso text-white hover:bg-sucesso">
                    Liberado {almoco.confirmado_em ? hora(almoco.confirmado_em) : ""}
                  </Badge>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-[11px] text-suave"
                    onClick={() => desfazer.mutate(almoco.id)}
                    disabled={desfazer.isPending}
                  >
                    Desfazer
                  </Button>
                </>
              ) : almoco.status === "pendente" ? (
                <Badge variant="secondary">Aguardando</Badge>
              ) : (
                <Badge variant="outline">{almoco.status}</Badge>
              )}
            </div>
          </div>
        ))}
      </Card>

      {eu.papel === "admin" && (
        <p className="mt-4 text-center text-[11px] text-muito-suave">
          Você está no painel do refeitório como admin.
        </p>
      )}
    </div>
  );
}
