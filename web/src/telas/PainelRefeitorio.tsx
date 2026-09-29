import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, UserPlus, XCircle } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { Button } from "@/componentes/ui/button";
import { Card, CardContent } from "@/componentes/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/componentes/ui/dialog";
import { Input } from "@/componentes/ui/input";
import { Label } from "@/componentes/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/componentes/ui/select";
import { mensagemDeErro } from "@/comum/erros";
import { hora } from "@/comum/formato";
import { PAGINA_PAINEL } from "@/comum/layout";
import { cn } from "@/comum/utilitarios";
import { useSair } from "@/hooks/sessao";
import type { AlmocoDoDia } from "@/interfaces/almoco";
import type { Departamento } from "@/interfaces/admin";
import type { Eu } from "@/interfaces/sessao";

const AVISOS: Record<string, string> = {
  almoco_ja_confirmado: "Este código já foi usado hoje.",
  almoco_expirado: "Código expirado. Peça para gerar outro.",
  codigo_barras_invalido: "Código não encontrado.",
};

// Rascunho: como o termo de colaborador, precisa de revisão jurídica antes
// de virar o texto oficial usado de verdade.
const TERMOS_VISITANTE = [
  "Seu nome e a área responsável ficam registrados para o controle interno do refeitório.",
  "O almoço é de cortesia, para uma única refeição de hoje.",
];

interface Confirmacao extends AlmocoDoDia {
  colaborador_nome: string;
}

interface Feedback {
  tom: "ok" | "erro";
  titulo: string;
  detalhe?: string;
}


export function PainelRefeitorio({ eu }: { eu: Eu }) {
  const sair = useSair();
  const campo = useRef<HTMLInputElement>(null);

  const [codigo, setCodigo] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [visitanteAberto, setVisitanteAberto] = useState(false);
  const [nomeVisitante, setNomeVisitante] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");
  const [termosAceitos, setTermosAceitos] = useState(false);

  const departamentos = useQuery({
    queryKey: ["departamentos-visitante"],
    queryFn: () => api.get<Departamento[]>("/almocos/departamentos-visitante"),
    enabled: visitanteAberto,
  });

  const registrarVisitante = useMutation({
    mutationFn: () =>
      api.post<AlmocoDoDia>("/almocos/visitante", {
        nome: nomeVisitante.trim(),
        departamento_id: departamentoId,
        termos_aceitos: termosAceitos,
      }),
    onSuccess: () => {
      setFeedback({ tom: "ok", titulo: nomeVisitante.trim(), detalhe: "Visitante liberado" });
      fecharVisitante();
    },
  });

  function abrirVisitante() {
    setNomeVisitante("");
    setDepartamentoId("");
    setTermosAceitos(false);
    registrarVisitante.reset();
    setVisitanteAberto(true);
  }

  function fecharVisitante() {
    setVisitanteAberto(false);
    campo.current?.focus();
  }

  const confirmar = useMutation({
    mutationFn: (codigo_barras: string) =>
      api.post<Confirmacao>("/almocos/confirmar", { codigo_barras }),
    onSuccess: (resposta) =>
      setFeedback({
        tom: "ok",
        titulo: resposta.colaborador_nome,
        detalhe: `Liberado às ${hora(resposta.confirmado_em ?? resposta.criado_em)}`,
      }),
    onError: (erro) => setFeedback({ tom: "erro", titulo: mensagemDeErro(erro, AVISOS) }),
    onSettled: () => {
      setCodigo("");
      campo.current?.focus();
    },
  });

  
  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(id);
  }, [feedback]);

  function enviarCodigo(evento: FormEvent) {
    evento.preventDefault();
    const valor = codigo.trim();
    if (valor && !confirmar.isPending) confirmar.mutate(valor);
  }

  // Pausado com o dialog de visitante aberto: do contrário, o reforço de
  // foco tomaria o campo de volta do meio da digitação do nome.
  useEffect(() => {
    if (visitanteAberto) return;
    function refocar() {
      campo.current?.focus();
    }
    refocar();
    const intervalo = setInterval(refocar, 2000);
    window.addEventListener("focus", refocar);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener("focus", refocar);
    };
  }, [visitanteAberto]);

  return (
    <div
      className={cn(PAGINA_PAINEL, "min-h-screen pb-10")}
      onClick={() => !visitanteAberto && campo.current?.focus()}
    >
      <header className="flex items-center gap-3 py-5">
        {eu.papel === "admin" && (
          <Button asChild variant="ghost" size="icon" aria-label="Voltar ao início">
            <Link to="/">
              <ArrowLeft />
            </Link>
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="text-base font-bold">Refeitório</h1>
          <p className="truncate text-xs text-suave">{eu.nome_completo}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={abrirVisitante}
        >
          <UserPlus />
          Novo visitante
        </Button>
        <Button variant="ghost" size="sm" onClick={() => sair.mutate()}>
          Sair
        </Button>
      </header>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={enviarCodigo}>
            <Label htmlFor="codigo">Leitor de código de barras</Label>
            <Input
              id="codigo"
              ref={campo}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="Aguardando a leitura…"
            
              className="mt-1.5 h-14 font-mono text-2xl tracking-wider"
            />
            <p className="mt-3 text-xs text-suave">
              {confirmar.isPending ? "Conferindo…" : "Passe o código no leitor."}
            </p>
          </form>
        </CardContent>
      </Card>

      {feedback && (
        <Card
          role="status"
          className={cn(
            "mt-4",
            feedback.tom === "ok"
              ? "border-sucesso/30 bg-sucesso/10"
              : "border-perigo/30 bg-perigo/10",
          )}
        >
          <CardContent className="flex items-center gap-3 p-5">
            {feedback.tom === "ok" ? (
              <CheckCircle2 className="size-10 shrink-0 text-sucesso" />
            ) : (
              <XCircle className="size-10 shrink-0 text-perigo" />
            )}
            <div className="min-w-0">
              <p
                className={cn(
                  "truncate text-2xl font-extrabold",
                  feedback.tom === "ok" ? "text-sucesso" : "text-perigo",
                )}
              >
                {feedback.titulo}
              </p>
              {feedback.detalhe && <p className="text-sm text-suave">{feedback.detalhe}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={visitanteAberto} onOpenChange={(aberto) => !aberto && fecharVisitante()}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Novo visitante</DialogTitle>
            <DialogDescription>
              O visitante lê o termo abaixo e informa o nome e a área que o recebe.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="nome-visitante">Nome completo</Label>
              <Input
                id="nome-visitante"
                value={nomeVisitante}
                onChange={(e) => setNomeVisitante(e.target.value)}
                autoFocus
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="departamento-visitante">Área responsável</Label>
              <Select value={departamentoId} onValueChange={setDepartamentoId}>
                <SelectTrigger id="departamento-visitante">
                  <SelectValue placeholder="Escolha a área" />
                </SelectTrigger>
                <SelectContent>
                  {(departamentos.data ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-borda p-3">
              <p className="mb-1.5 text-xs font-bold">Antes de liberar</p>
              <ul className="list-disc space-y-1 pl-4 text-[11px] text-suave">
                {TERMOS_VISITANTE.map((linha) => (
                  <li key={linha}>{linha}</li>
                ))}
              </ul>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px]">
                <input
                  type="checkbox"
                  checked={termosAceitos}
                  onChange={(e) => setTermosAceitos(e.target.checked)}
                  className="mt-0.5"
                />
                O visitante leu e aceita as informações acima.
              </label>
            </div>

            {registrarVisitante.error && (
              <Aviso>{mensagemDeErro(registrarVisitante.error, AVISOS)}</Aviso>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={fecharVisitante}>
              Cancelar
            </Button>
            <Button
              variant="destaque"
              disabled={
                !nomeVisitante.trim() ||
                !departamentoId ||
                !termosAceitos ||
                registrarVisitante.isPending
              }
              onClick={() => registrarVisitante.mutate()}
            >
              {registrarVisitante.isPending ? "Liberando…" : "Liberar visitante"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
