import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  ScanBarcode,
  UserPlus,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { BuscarColaborador } from "@/componentes/BuscarColaborador";
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
import { dinheiro, hora } from "@/comum/formato";
import { PAGINA_PAINEL } from "@/comum/layout";
import { PAPEIS_BALCAO } from "@/comum/navegacao";
import { cn } from "@/comum/utilitarios";
import { useSair } from "@/hooks/sessao";
import type { AlmocoDoDia, VisitanteAlmocoResposta } from "@/interfaces/almoco";
import type { Departamento, PixGerado } from "@/interfaces/admin";
import type { ColaboradorParaAlmoco } from "@/interfaces/refeitorio";
import type { Eu } from "@/interfaces/sessao";

const AVISOS: Record<string, string> = {
  almoco_ja_confirmado: "Este código já foi usado hoje.",
  almoco_expirado: "Código expirado. Peça para gerar outro.",
  codigo_barras_invalido: "Código não encontrado.",
};

const AVISOS_MANUAL: Record<string, string> = {
  almoco_ja_confirmado: "Esta pessoa já teve o almoço confirmado hoje.",
  almoco_ja_gerado_hoje: "Esta pessoa já tem almoço lançado hoje.",
  almoco_nao_confirmado: "Este almoço não está confirmado.",
};

// Rascunho: como o termo de colaborador, precisa de revisão jurídica antes
// de virar o texto oficial usado de verdade.
const TERMOS_VISITANTE = [
  "Seu nome e a área responsável ficam registrados para o controle interno do refeitório.",
];

interface PrecoVigente {
  valor: string;
}

interface Confirmacao extends AlmocoDoDia {
  colaborador_nome: string;
}

interface Feedback {
  tom: "ok" | "erro";
  titulo: string;
  detalhe?: string;
  almocoId?: string;
}


export function PainelRefeitorio({ eu }: { eu: Eu }) {
  const sair = useSair();
  const campo = useRef<HTMLInputElement>(null);
  const balcao = PAPEIS_BALCAO.includes(eu.papel);

  const [codigo, setCodigo] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [manualAberto, setManualAberto] = useState(false);

  const [visitanteAberto, setVisitanteAberto] = useState(false);
  const [nomeVisitante, setNomeVisitante] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");
  const [termosAceitos, setTermosAceitos] = useState(false);
  const [cortesia, setCortesia] = useState(false);
  const [visitanteGerado, setVisitanteGerado] = useState<{
    almoco: AlmocoDoDia;
    pix: PixGerado;
  } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const departamentos = useQuery({
    queryKey: ["departamentos-visitante"],
    queryFn: () => api.get<Departamento[]>("/almocos/departamentos-visitante"),
    enabled: visitanteAberto,
  });

  const preco = useQuery({
    queryKey: ["preco-visitante"],
    queryFn: () => api.get<PrecoVigente | null>("/almocos/preco-visitante"),
    enabled: visitanteAberto,
  });

  const registrarVisitante = useMutation({
    mutationFn: () =>
      api.post<VisitanteAlmocoResposta>("/almocos/visitante", {
        nome: nomeVisitante.trim(),
        departamento_id: departamentoId,
        termos_aceitos: termosAceitos,
        cortesia,
      }),
    onSuccess: (resposta) => {
      setFeedback({ tom: "ok", titulo: nomeVisitante.trim(), detalhe: "Visitante liberado" });
      if (resposta.pix) {
        setVisitanteGerado({ almoco: resposta.almoco, pix: resposta.pix });
      } else {
        fecharVisitante();
      }
    },
  });

  const confirmarPixVisitante = useMutation({
    mutationFn: (id: string) => api.post<AlmocoDoDia>(`/almocos/${id}/confirmar-pix`),
    onSuccess: fecharVisitante,
  });

  async function copiarCodigoPix() {
    if (!visitanteGerado) return;
    try {
      await navigator.clipboard.writeText(visitanteGerado.pix.copia_cola);
      setCopiado(true);
    } catch {
      // Navegador sem permissão de clipboard — sem crash, só não copia.
    }
  }

  useEffect(() => {
    if (!copiado) return;
    const id = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(id);
  }, [copiado]);

  function abrirVisitante() {
    setNomeVisitante("");
    setDepartamentoId("");
    setTermosAceitos(false);
    setCortesia(false);
    setVisitanteGerado(null);
    registrarVisitante.reset();
    confirmarPixVisitante.reset();
    setVisitanteAberto(true);
  }

  function fecharVisitante() {
    setVisitanteAberto(false);
    setVisitanteGerado(null);
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
        almocoId: resposta.id,
      }),
    onError: (erro) => setFeedback({ tom: "erro", titulo: mensagemDeErro(erro, AVISOS) }),
    onSettled: () => {
      setCodigo("");
      campo.current?.focus();
    },
  });

  const confirmarManual = useMutation({
    mutationFn: (pessoa: ColaboradorParaAlmoco) =>
      api.post<AlmocoDoDia>("/almocos/manual", { colaborador_id: pessoa.id }),
    onSuccess: (almoco, pessoa) => {
      setManualAberto(false);
      setFeedback({
        tom: "ok",
        titulo: pessoa.nome_completo,
        detalhe: `Liberado sem leitor às ${hora(almoco.confirmado_em ?? almoco.criado_em)}`,
        almocoId: almoco.id,
      });
    },
  });

  const desfazer = useMutation({
    mutationFn: ({ id }: { id: string; nome: string }) =>
      api.post<AlmocoDoDia>(`/almocos/${id}/desfazer`),
    onSuccess: (_almoco, { nome }) =>
      setFeedback({
        tom: "ok",
        titulo: nome,
        detalhe: "Leitura desfeita. Voltou para aguardando.",
      }),
    onError: (erro) => setFeedback({ tom: "erro", titulo: mensagemDeErro(erro, AVISOS_MANUAL) }),
  });

  function abrirManual() {
    confirmarManual.reset();
    setManualAberto(true);
  }

  const desfazivel = balcao ? feedback?.almocoId : undefined;

  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), desfazivel ? 15_000 : 6000);
    return () => clearTimeout(id);
  }, [feedback, desfazivel]);

  function enviarCodigo(evento: FormEvent) {
    evento.preventDefault();
    const valor = codigo.trim();
    if (valor && !confirmar.isPending) confirmar.mutate(valor);
  }

  const dialogAberto = visitanteAberto || manualAberto;

  // Pausado com um dialog aberto: do contrário, o reforço de foco tomaria o
  // campo de volta do meio da digitação do nome.
  useEffect(() => {
    if (dialogAberto) return;
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
  }, [dialogAberto]);

  return (
    <div
      className={cn(PAGINA_PAINEL, "min-h-screen pb-10")}
      onClick={() => !dialogAberto && campo.current?.focus()}
    >
      <header className="flex flex-wrap items-center gap-3 py-5">
        {eu.papel !== "refeitorio" && (
          <Button asChild variant="ghost" size="icon" aria-label="Voltar ao início">
            <Link to="/">
              <ArrowLeft />
            </Link>
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold">Refeitório</h1>
          <p className="truncate text-xs text-suave">{eu.nome_completo}</p>
        </div>
        <div className="order-last flex w-full flex-wrap gap-2 sm:order-none sm:w-auto">
          {balcao && (
            <Button
              variant="outline"
              size="sm"
              className="h-10 flex-1 sm:h-8 sm:flex-none"
              onClick={abrirManual}
            >
              <ScanBarcode />
              Confirmar sem leitor
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-10 flex-1 sm:h-8 sm:flex-none"
            onClick={abrirVisitante}
          >
            <UserPlus />
            Novo visitante
          </Button>
        </div>
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
          <CardContent className="flex flex-wrap items-center gap-3 p-5">
            {feedback.tom === "ok" ? (
              <CheckCircle2 className="size-10 shrink-0 text-sucesso" />
            ) : (
              <XCircle className="size-10 shrink-0 text-perigo" />
            )}
            <div className="min-w-0 flex-1">
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
            {desfazivel && (
              <Button
                variant="outline"
                className="h-10 w-full sm:h-9 sm:w-auto"
                disabled={desfazer.isPending}
                onClick={() => desfazer.mutate({ id: desfazivel, nome: feedback.titulo })}
              >
                {desfazer.isPending ? "Desfazendo…" : "Desfazer"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={manualAberto} onOpenChange={setManualAberto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmar almoço sem leitor</DialogTitle>
            <DialogDescription>
              Para quando o leitor de código de barras falha. O almoço entra como lançamento
              manual, com o seu nome e o horário registrados.
            </DialogDescription>
          </DialogHeader>

          <BuscarColaborador
            acao="Confirmar"
            ocupado={confirmarManual.isPending}
            aoEscolher={(pessoa) => confirmarManual.mutate(pessoa)}
          />

          {confirmarManual.error && (
            <Aviso>{mensagemDeErro(confirmarManual.error, AVISOS_MANUAL)}</Aviso>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={visitanteAberto} onOpenChange={(aberto) => !aberto && fecharVisitante()}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Novo visitante</DialogTitle>
            <DialogDescription>
              {visitanteGerado
                ? "Visitante já liberado. Pague pelo Pix abaixo quando puder."
                : "O visitante lê o termo abaixo e informa o nome e a área que o recebe."}
            </DialogDescription>
          </DialogHeader>

          {!visitanteGerado && (
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

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={cortesia}
                  onChange={(e) => setCortesia(e.target.checked)}
                />
                Cortesia (não cobra nada)
              </label>

              <div className="rounded-lg border border-borda p-3">
                <p className="mb-1.5 text-xs font-bold">Antes de liberar</p>
                <ul className="list-disc space-y-1 pl-4 text-[11px] text-suave">
                  {TERMOS_VISITANTE.map((linha) => (
                    <li key={linha}>{linha}</li>
                  ))}
                  {cortesia ? (
                    <li>Esta refeição é cortesia: não será cobrada.</li>
                  ) : (
                    <li>
                      Esta refeição custa{" "}
                      <span className="font-bold text-ink">
                        {preco.data ? dinheiro(preco.data.valor) : "—"}
                      </span>
                      , o mesmo valor cobrado de todo mundo. Um Pix aparece na tela assim que
                      liberar.
                    </li>
                  )}
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
          )}

          {visitanteGerado && (
            <div className="grid gap-3 text-center">
              <img
                src={visitanteGerado.pix.qr_code_base64}
                alt="QR Code Pix"
                className="mx-auto h-48 w-48"
              />
              <p className="text-xl font-extrabold">{dinheiro(visitanteGerado.pix.valor)}</p>
              <Button type="button" variant="outline" onClick={() => void copiarCodigoPix()}>
                {copiado ? <Check /> : <Copy />}
                {copiado ? "Copiado!" : "Copiar código Pix"}
              </Button>
              {confirmarPixVisitante.error && (
                <Aviso>{mensagemDeErro(confirmarPixVisitante.error, AVISOS)}</Aviso>
              )}
            </div>
          )}

          <DialogFooter>
            {!visitanteGerado ? (
              <>
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
              </>
            ) : (
              <>
                <Button variant="outline" onClick={fecharVisitante}>
                  Fechar
                </Button>
                <Button
                  variant="destaque"
                  disabled={confirmarPixVisitante.isPending}
                  onClick={() => confirmarPixVisitante.mutate(visitanteGerado.almoco.id)}
                >
                  {confirmarPixVisitante.isPending ? "Confirmando…" : "Confirmar pagamento"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
