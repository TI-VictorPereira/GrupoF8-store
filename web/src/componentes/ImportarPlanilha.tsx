import { useMutation } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";

import { Aviso } from "@/componentes/Aviso";
import { Button } from "@/componentes/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/componentes/ui/dialog";
import { mensagemDeErro } from "@/comum/erros";
import { baixarCsv, lerCsv } from "@/comum/planilha";

/** O que a API devolve nas duas importações. */
export interface ResultadoImportacao {
  erros: string[];
  criados?: number;
  atualizados?: number;
}

interface Props<L, R extends ResultadoImportacao> {
  titulo: string;
  descricao: string;
  /** Uma linha de exemplo com os nomes de coluna aceitos. */
  modelo: Record<string, unknown>;
  nomeDoModelo: string;
  converter: (linha: Record<string, string>) => L | string;
  enviar: (linhas: L[]) => Promise<R>;
  aoConcluir: () => void;  extraNoResultado?: (resultado: R) => ReactNode;
}

function resumir(linha: unknown): string {
  if (typeof linha !== "object" || linha === null) return String(linha);
  return Object.entries(linha as Record<string, unknown>)
    .filter(([, valor]) => valor !== null && valor !== undefined && valor !== "")
    .filter(([chave]) => !chave.endsWith("_id"))
    .map(([chave, valor]) => `${chave}: ${valor}`)
    .join(" · ");
}

export function ImportarPlanilha<L, R extends ResultadoImportacao>({
  titulo,
  descricao,
  modelo,
  nomeDoModelo,
  converter,
  enviar,
  aoConcluir,
  extraNoResultado,
}: Props<L, R>) {
  const [aberto, setAberto] = useState(false);
  const [linhas, setLinhas] = useState<L[] | null>(null);
  const [descartadas, setDescartadas] = useState<[string, number][]>([]);
  const [problemaNoArquivo, setProblemaNoArquivo] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  const importar = useMutation({
    mutationFn: () => enviar(linhas!),
    onSuccess: aoConcluir,
  });

  function limpar() {
    setLinhas(null);
    setDescartadas([]);
    setProblemaNoArquivo(null);
    importar.reset();
    if (arquivo.current) arquivo.current.value = "";
  }

  async function escolher(entrada: File) {
    limpar();
    try {
      const cruas = lerCsv(await entrada.text());
      if (cruas.length === 0) {
        setProblemaNoArquivo(
          "O arquivo não tem linhas. Confira se é CSV e se o cabeçalho bate com o modelo.",
        );
        return;
      }

      const convertidas = cruas.map(converter);
      const validas = convertidas.filter((linha): linha is L => typeof linha !== "string");

      const porMotivo = new Map<string, number>();
      for (const item of convertidas) {
        if (typeof item === "string") porMotivo.set(item, (porMotivo.get(item) ?? 0) + 1);
      }
      const motivos = [...porMotivo.entries()].sort((a, b) => b[1] - a[1]);

      if (validas.length === 0) {
        setProblemaNoArquivo(
          `Nenhuma das ${cruas.length} linhas pôde ser usada. ` +
            motivos.map(([motivo, quantas]) => `${quantas} ${motivo}`).join("; ") + ".",
        );
        return;
      }
      setLinhas(validas);
      setDescartadas(motivos);
    } catch {
      setProblemaNoArquivo("Não foi possível ler o arquivo.");
    }
  }

  const resultado = importar.data;

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        Importar planilha
      </Button>

      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          setAberto(v);
          if (!v) limpar();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descricao}</DialogDescription>
          </DialogHeader>

          {resultado ? (
            <div className="grid gap-3">
              <p className="text-sm font-semibold text-sucesso">
                {resultado.criados ?? 0} criado(s)
                {resultado.atualizados !== undefined
                  ? `, ${resultado.atualizados} atualizado(s)`
                  : ""}
                .
              </p>
              {resultado.erros.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-semibold text-perigo">
                    {resultado.erros.length} linha(s) não entraram:
                  </p>
                  <ul className="max-h-40 overflow-y-auto rounded-lg border border-borda p-2">
                    {resultado.erros.map((erro) => (
                      <li key={erro} className="py-0.5 text-[11px] text-suave">
                        {erro}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {extraNoResultado?.(resultado)}
            </div>
          ) : (
            <div className="grid gap-3">
              <Button variant="ghost" onClick={() => baixarCsv(nomeDoModelo, [modelo])}>
                Baixar modelo
              </Button>

              <input
                ref={arquivo}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const escolhido = e.target.files?.[0];
                  if (escolhido) void escolher(escolhido);
                }}
                className="rounded-lg border border-borda p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              />

              {problemaNoArquivo && <Aviso>{problemaNoArquivo}</Aviso>}
              {importar.error && <Aviso>{mensagemDeErro(importar.error)}</Aviso>}

              {linhas && (
                <div className="rounded-lg border border-borda p-3">
                  <p className="text-sm font-semibold">{linhas.length} linha(s) prontas</p>
                  {descartadas.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {descartadas.map(([motivo, quantas]) => (
                        <li key={motivo} className="text-[11px] text-suave">
                          {quantas} linha(s) ignorada(s): {motivo}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 max-h-32 min-w-0 overflow-y-auto">
                    {linhas.slice(0, 3).map((linha, indice) => (
                      <p key={indice} className="py-0.5 text-[11px] break-all text-suave">
                        {resumir(linha)}
                      </p>
                    ))}
                    {linhas.length > 3 && (
                      <p className="text-[11px] text-muito-suave">
                        e mais {linhas.length - 3}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              {resultado ? "Fechar" : "Cancelar"}
            </Button>
            {!resultado && (
              <Button
                variant="destaque"
                disabled={!linhas || importar.isPending}
                onClick={() => importar.mutate()}
              >
                {importar.isPending ? "Importando…" : `Importar ${linhas?.length ?? 0}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
