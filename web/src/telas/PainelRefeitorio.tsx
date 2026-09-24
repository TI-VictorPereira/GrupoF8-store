import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { api } from "@/api/cliente";
import { Button } from "@/componentes/ui/button";
import { Card, CardContent } from "@/componentes/ui/card";
import { Input } from "@/componentes/ui/input";
import { Label } from "@/componentes/ui/label";
import { mensagemDeErro } from "@/comum/erros";
import { hora } from "@/comum/formato";
import { PAGINA_PAINEL } from "@/comum/layout";
import { cn } from "@/comum/utilitarios";
import { useSair } from "@/hooks/sessao";
import type { AlmocoDoDia } from "@/interfaces/almoco";
import type { Eu } from "@/interfaces/sessao";

const AVISOS: Record<string, string> = {
  almoco_ja_confirmado: "Este código já foi usado hoje.",
  almoco_expirado: "Código expirado. Peça para gerar outro.",
  codigo_barras_invalido: "Código não encontrado.",
};

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
    if (valor) confirmar.mutate(valor);
  }

  return (
    <div className={cn(PAGINA_PAINEL, "min-h-screen pb-10")}>
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
        <Button variant="ghost" size="sm" onClick={() => sair.mutate()} className="ml-auto">
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
    </div>
  );
}
