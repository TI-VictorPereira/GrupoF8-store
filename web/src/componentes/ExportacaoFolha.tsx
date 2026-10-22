import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/cliente";
import { ArquivosDeAssinatura } from "@/componentes/ArquivosDeAssinatura";
import { Aviso } from "@/componentes/Aviso";
import { DiaDeFechamento } from "@/componentes/DiaDeFechamento";
import { Button } from "@/componentes/ui/button";
import { Card, CardContent } from "@/componentes/ui/card";
import { Input } from "@/componentes/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/componentes/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/componentes/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/componentes/ui/tabs";
import { mensagemDeErro } from "@/comum/erros";
import { dataHora, diaMes, dinheiro, mesPorExtenso } from "@/comum/formato";
import { cicloDe, competenciaDe } from "@/comum/periodo";
import { useSessao } from "@/hooks/sessao";

const AVISOS: Record<string, string> = {
  ciclo_ainda_aberto: "Este ciclo ainda não terminou. Espere ele fechar.",
  competencia_fechada: "Esta competência já foi fechada. Descarte o lote para refazer.",
};

interface ConsumoDaPessoa {
  codemp: number;
  codparc: number;
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
  quantidade_pj: number;
  total_pj: string;
  quantidade_cortesias_isentos: number;
  total_cortesias_isentos: string;
  lote: Lote | null;
}

export function ExportacaoFolha() {
  const clienteConsulta = useQueryClient();
  const { eu } = useSessao();
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
  const lote = dados?.lote ?? null;
  const fechado = lote?.status === "exportada";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">Ciclo</h2>
            <p className="mt-0.5 text-[11px] text-suave">
              {diaMes(faixa.de)} a {diaMes(faixa.ate)}. Vale para as duas abas.
            </p>
          </div>

          <Select value={competencia} onValueChange={setCompetencia}>
            <SelectTrigger aria-label="Competência" className="w-full sm:w-[17rem]">
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

        {aberto && (
          <p className="mt-3 text-[11px] text-muito-suave">
            Este ciclo ainda está aberto e vai até {diaMes(faixa.ate)}. O que aparece agora é
            parcial.
          </p>
        )}

        <Tabs defaultValue="sankhya" className="mt-4">
          <TabsList className="mb-3">
            <TabsTrigger value="sankhya">Importação Sankhya</TabsTrigger>
            <TabsTrigger value="administrativo">Administrativo</TabsTrigger>
          </TabsList>

          <TabsContent value="sankhya">
            <p className="text-[11px] text-suave">
              O que entra no arquivo de eventos da folha. Um ciclo inteiro por arquivo.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] text-suave">Linhas no arquivo</p>
                <p className="text-sm font-semibold">{dados?.linhas ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-suave">Total a descontar</p>
                <p className="text-sm font-semibold">{dinheiro(dados?.total ?? 0)}</p>
              </div>
            </div>

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
                  não muda mais: ele sai do que foi carimbado.
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
            </div>

            {/* Descartar exige motivo: é a única coisa que explica, meses depois,
                por que um ciclo foi fechado duas vezes. */}
            {descartando && lote && (
              <div className="border-perigo/30 mt-3 rounded-lg border p-3">
                <p className="text-xs font-bold">Descartar o lote deste ciclo</p>
                <p className="mt-0.5 mb-2 text-[11px] text-suave">
                  Solta o carimbo de tudo que entrou nele e libera a competência para ser fechada
                  de novo. Use quando a importação no Sankhya não passou.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Por que está descartando?"
                    className="w-full sm:w-72"
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
                            <span
                              className="text-perigo"
                              title="PJ não tem matrícula; este é o código de parceiro"
                            >
                              parc. {pessoa.codparc}
                            </span>
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
          </TabsContent>

          <TabsContent value="administrativo">
            {eu?.papel === "admin" && <DiaDeFechamento />}

            <h3 className="text-sm font-bold">Relatórios do ciclo</h3>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col rounded-lg border border-borda p-3">
                <p className="text-xs font-bold">PJ (pessoa jurídica)</p>
                <p className="mt-0.5 text-[11px] text-suave">
                  PJ não tem matrícula, então não entra no arquivo do Sankhya. Consumo de loja e
                  refeitório de cada um, para cobrar por outro caminho.
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {dados?.quantidade_pj ?? 0} {dados?.quantidade_pj === 1 ? "pessoa" : "pessoas"}{" "}
                  · {dinheiro(dados?.total_pj ?? 0)}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full self-start sm:w-auto"
                  disabled={!dados?.quantidade_pj || baixar.isPending}
                  onClick={() =>
                    baixar.mutate({
                      rota: `/exportacoes/sem-matricula?competencia=${competencia}`,
                      nome: `pj-${competencia}.xlsx`,
                    })
                  }
                >
                  Baixar relatório de PJ
                </Button>
              </div>

              <div className="flex flex-col rounded-lg border border-borda p-3">
                <p className="text-xs font-bold">Isentos, cortesias e visitantes</p>
                <p className="mt-0.5 text-[11px] text-suave">
                  Almoços que não descontam em folha: funcionário isento, cortesia e visitante
                  (inclusive quem pagou no Pix). Detalhado e total por pessoa.
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {dados?.quantidade_cortesias_isentos ?? 0}{" "}
                  {dados?.quantidade_cortesias_isentos === 1 ? "almoço" : "almoços"} ·{" "}
                  {dinheiro(dados?.total_cortesias_isentos ?? 0)} pagos pela empresa
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full self-start sm:w-auto"
                  disabled={baixar.isPending}
                  onClick={() =>
                    baixar.mutate({
                      rota: `/exportacoes/almocos-sem-desconto?competencia=${competencia}`,
                      nome: `almocos-isentos-cortesias-visitantes-${competencia}.xlsx`,
                    })
                  }
                >
                  Baixar relatório de isentos
                </Button>
              </div>
            </div>

            <ArquivosDeAssinatura competencia={competencia} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
