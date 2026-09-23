import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { Button } from "@/componentes/ui/button";
import { Card, CardContent } from "@/componentes/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/componentes/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/componentes/ui/select";
import { Input } from "@/componentes/ui/input";
import { mensagemDeErro } from "@/comum/erros";
import { dataHora, diaMes, dinheiro, mesPorExtenso } from "@/comum/formato";
import { cicloDe, competenciaDe } from "@/comum/periodo";

const AVISOS: Record<string, string> = {
  ciclo_ainda_aberto: "Este ciclo ainda não terminou. Espere passar o dia 20.",
  competencia_fechada: "Esta competência já foi fechada. Descarte o lote para refazer.",
};

interface PessoaSemMatricula {
  codemp: number;
  codparc: number;
  nome: string;
  total: string;
}

interface ConsumoDaPessoa {
  codemp: number;
  codfunc: number | null;
  codigo: string;
  nome: string;
  loja: string;
  refeitorio: string;
  total: string;
}

interface Lote {
  id: string;
  status: string;
  fechado_em: string | null;
  total_registros: number | null;
  valor_total: string | null;
}

interface ResumoFolha {
  competencia: string;
  referencia: string;
  linhas: number;
  total: string;
  pessoas: ConsumoDaPessoa[];
  sem_matricula: PessoaSemMatricula[];
  total_sem_matricula: string;
  lote: Lote | null;
}

export function ExportacaoFolha() {
  const clienteConsulta = useQueryClient();
  const [competencia, setCompetencia] = useState(() => competenciaDe(new Date()));
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const aberto = competencia === competenciaDe(new Date());

  const ciclos = useQuery({
    queryKey: ["competencias-empresa"],
    queryFn: () => api.get<string[]>("/consumo/competencias/empresa"),
  });

  const resumo = useQuery({
    queryKey: ["exportacao-folha", competencia],
    queryFn: () => api.get<ResumoFolha>(`/exportacoes/folha/resumo?competencia=${competencia}`),
  });

  const baixar = useMutation({
    mutationFn: ({ rota, nome }: { rota: string; nome: string }) => api.baixar(rota, nome),
  });

  function recarregar() {
    void clienteConsulta.invalidateQueries({ queryKey: ["exportacao-folha"] });
  }

  const fechar = useMutation({
    mutationFn: () => api.post<Lote>("/exportacoes/folha/fechar", { competencia }),
    onSuccess: recarregar,
  });

  const descartar = useMutation({
    mutationFn: (id: string) =>
      api.post<Lote>(`/exportacoes/lotes/${id}/descartar`, { motivo }),
    onSuccess: () => {
      recarregar();
      setDescartando(false);
      setMotivo("");
    },
  });

  const dados = resumo.data;
  const faixa = cicloDe(competencia);
  const fora = dados?.sem_matricula ?? [];
  const lote = dados?.lote ?? null;
  const fechado = lote?.status === "exportada";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">Exportar para o Sankhya</h2>
            <p className="mt-0.5 text-[11px] text-suave">
              Importação de eventos da folha. Um ciclo inteiro por arquivo.
            </p>
          </div>

          <Select value={competencia} onValueChange={setCompetencia}>
            <SelectTrigger aria-label="Competência" className="w-[17rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(ciclos.data ?? [competencia]).map((opcao) => {
                const intervalo = cicloDe(opcao);
                return (
                  <SelectItem key={opcao} value={opcao}>
                    {mesPorExtenso(opcao)} · {diaMes(intervalo.de)} a {diaMes(intervalo.ate)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {(resumo.error || baixar.error || fechar.error || descartar.error) && (
          <div className="mt-3">
            <Aviso>
              {mensagemDeErro(
                resumo.error ?? baixar.error ?? fechar.error ?? descartar.error,
                AVISOS,
              )}
            </Aviso>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[11px] text-suave">Período</p>
            <p className="text-sm font-semibold">
              {diaMes(faixa.de)} a {diaMes(faixa.ate)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-suave">Linhas no arquivo</p>
            <p className="text-sm font-semibold">{dados?.linhas ?? "—"}</p>
          </div>
          <div>
            <p className="text-[11px] text-suave">Total a descontar</p>
            <p className="text-sm font-semibold">{dinheiro(dados?.total ?? 0)}</p>
          </div>
        </div>

        {aberto && (
          <p className="mt-3 text-[11px] text-muito-suave">
            Este ciclo ainda está aberto e vai até {diaMes(faixa.ate)}. O que sair agora é
            parcial.
          </p>
        )}

        {fora.length > 0 && (
          <div className="mt-4 rounded-lg border border-borda p-3">
            <p className="text-xs font-bold">
              {fora.length} {fora.length === 1 ? "pessoa fica" : "pessoas ficam"} fora da folha
            </p>
            <p className="mt-0.5 text-[11px] text-suave">
              Sem matrícula não há CODFUNC, e sem CODFUNC a importação não aceita a linha. O
              consumo continua existindo: {dinheiro(dados?.total_sem_matricula ?? 0)} para cobrar
              por outro caminho.
            </p>
            <ul className="mt-2 space-y-0.5">
              {fora.map((pessoa) => (
                <li key={pessoa.codparc} className="flex justify-between text-[11px]">
                  <span className="truncate">{pessoa.nome}</span>
                  <span className="font-semibold">{dinheiro(pessoa.total)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* O fechamento é o que distingue "baixei para conferir" de "isto foi
            para o ERP". Sem ele, o segundo download é indistinguível de uma
            segunda importação, e o desconto dobra no holerite. */}
        {fechado && lote && (
          <div className="border-sucesso/30 bg-sucesso/10 mt-4 rounded-lg border p-3">
            <p className="text-xs font-bold text-sucesso">
              Ciclo fechado e exportado
              {lote.fechado_em ? ` em ${dataHora(lote.fechado_em)}` : ""}
            </p>
            <p className="mt-0.5 text-[11px] text-suave">
              {lote.total_registros} linha(s) · {dinheiro(lote.valor_total ?? 0)}. O arquivo
              não muda mais: ele sai do que foi carimbado, não do cálculo por data.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant={fechado ? "outline" : "destaque"}
            disabled={!dados?.linhas || baixar.isPending}
            onClick={() =>
              baixar.mutate({
                rota: `/exportacoes/folha?competencia=${competencia}`,
                nome: `folha-${competencia}.xlsx`,
              })
            }
          >
            {fechado ? "Baixar novamente" : "Baixar arquivo da folha"}
          </Button>

          {!fechado && (
            <Button
              variant="destaque"
              disabled={aberto || !dados?.linhas || fechar.isPending}
              title={aberto ? "O ciclo ainda não terminou." : undefined}
              onClick={() => fechar.mutate()}
            >
              {fechar.isPending ? "Fechando…" : "Fechar ciclo e exportar"}
            </Button>
          )}

          {fechado && !descartando && (
            <Button variant="ghost" onClick={() => setDescartando(true)}>
              Descartar lote
            </Button>
          )}
          {fora.length > 0 && (
            <Button
              variant="outline"
              disabled={baixar.isPending}
              onClick={() =>
                baixar.mutate({
                  rota: `/exportacoes/sem-matricula?competencia=${competencia}`,
                  nome: `sem-matricula-${competencia}.xlsx`,
                })
              }
            >
              Baixar quem ficou de fora
            </Button>
          )}
        </div>

        {/* Descartar exige motivo: é a única coisa que explica, meses depois,
            por que um ciclo foi fechado duas vezes. */}
        {descartando && lote && (
          <div className="border-perigo/30 mt-3 rounded-lg border p-3">
            <p className="text-xs font-bold">Descartar o lote deste ciclo</p>
            <p className="mt-0.5 mb-2 text-[11px] text-suave">
              Solta o carimbo de tudo que entrou nele e libera a competência para ser fechada de
              novo. Use quando a importação no Sankhya não passou.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Por que está descartando?"
                className="w-72"
              />
              <Button
                variant="destructive"
                disabled={motivo.trim().length < 3 || descartar.isPending}
                onClick={() => descartar.mutate(lote.id)}
              >
                {descartar.isPending ? "Descartando…" : "Confirmar descarte"}
              </Button>
              <Button variant="ghost" onClick={() => setDescartando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* A conferência é o que responde "por que descontaram isso de mim"
            sem precisar abrir a planilha e procurar a matrícula na mão. */}
        {(dados?.pessoas.length ?? 0) > 0 && (
          <div className="mt-5 overflow-x-auto">
            <Table className="tabela-admin">
              <TableHeader>
                <TableRow>
                  <TableHead>CODFUNC</TableHead>
                  <TableHead>Colaborador</TableHead>
                  <TableHead className="text-right">Loja</TableHead>
                  <TableHead className="text-right">Refeitório</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados?.pessoas.map((pessoa) => (
                  <TableRow key={`${pessoa.codigo}-${pessoa.codfunc ?? "sem"}`}>
                    <TableCell className="font-mono text-xs">
                      {pessoa.codfunc ?? (
                        <span className="text-perigo">sem matrícula</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-semibold">{pessoa.nome}</p>
                      <p className="text-[11px] text-suave">{pessoa.codigo}</p>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {Number(pessoa.loja) ? dinheiro(pessoa.loja) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {Number(pessoa.refeitorio) ? dinheiro(pessoa.refeitorio) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm font-bold">
                      {dinheiro(pessoa.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
