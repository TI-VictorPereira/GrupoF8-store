import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanBarcode } from "lucide-react";
import { useState } from "react";

import { api, buscarTudoPaginado } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { BuscarColaborador } from "@/componentes/BuscarColaborador";
import { FiltroPeriodo } from "@/componentes/FiltroPeriodo";
import { Carregando } from "@/componentes/Carregando";
import { PaginacaoControles } from "@/componentes/PaginacaoControles";
import { Vazio } from "@/componentes/Vazio";
import { Badge } from "@/componentes/ui/badge";
import { Button } from "@/componentes/ui/button";
import { Card, CardContent } from "@/componentes/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/componentes/ui/dialog";
import { Input } from "@/componentes/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/componentes/ui/table";
import { mensagemDeErro } from "@/comum/erros";
import { hora } from "@/comum/formato";
import { diaIso, hojeIso, intervaloDoFiltro, periodoInicial } from "@/comum/periodo";
import { baixarCsv } from "@/comum/planilha";
import { PrecoDoAlmoco } from "@/telas/admin/PrecoDoAlmoco";
import type { AlmocoDoDia } from "@/interfaces/almoco";
import type { Pagina } from "@/interfaces/comum";
import type { LinhaPainel } from "@/interfaces/refeitorio";

const POR_PAGINA = 20;

const AVISOS: Record<string, string> = {
  periodo_invalido: "A data final não pode ser anterior à inicial.",
  almoco_ja_confirmado: "Esta pessoa já teve o almoço confirmado hoje.",
  almoco_ja_gerado_hoje: "Esta pessoa já tem almoço lançado hoje.",
  almoco_nao_confirmado: "Este almoço não está confirmado.",
};

export function Almocos() {
  const clienteConsulta = useQueryClient();
  const [filtro, setFiltroBruto] = useState(() => periodoInicial("hoje"));
  const { de, ate } = intervaloDoFiltro(filtro);
  const [busca, setBuscaBruta] = useState("");
  const [pagina, setPagina] = useState(1);
  const [manualAberto, setManualAberto] = useState(false);

  function setFiltro(novo: typeof filtro) {
    setFiltroBruto(novo);
    setPagina(1);
  }

  function setBusca(novo: string) {
    setBuscaBruta(novo);
    setPagina(1);
  }

  const caminhoLista =
    `/almocos?de=${de}&ate=${ate}` + (busca.trim() ? `&busca=${encodeURIComponent(busca.trim())}` : "");

  const almocos = useQuery({
    queryKey: ["almocos-historico", caminhoLista, pagina],
    queryFn: () =>
      api.get<Pagina<LinhaPainel>>(`${caminhoLista}&pagina=${pagina}&por_pagina=${POR_PAGINA}`),
  });

  // Só a contagem interessa pros cartões — 1 item por chamada, total vem no envelope.
  const confirmadosCount = useQuery({
    queryKey: ["almocos-contagem", de, ate, "confirmado"],
    queryFn: () => api.get<Pagina<LinhaPainel>>(`/almocos?de=${de}&ate=${ate}&status=confirmado&por_pagina=1`),
  });
  const pendentesCount = useQuery({
    queryKey: ["almocos-contagem", de, ate, "pendente"],
    queryFn: () => api.get<Pagina<LinhaPainel>>(`/almocos?de=${de}&ate=${ate}&status=pendente&por_pagina=1`),
  });

  function recarregar() {
    void clienteConsulta.invalidateQueries({ queryKey: ["almocos-historico"] });
    void clienteConsulta.invalidateQueries({ queryKey: ["almocos-contagem"] });
    void clienteConsulta.invalidateQueries({ queryKey: ["painel-almocos"] });
    void clienteConsulta.invalidateQueries({ queryKey: ["admin-pendencias"] });
  }


  const confirmarManual = useMutation({
    mutationFn: (colaborador_id: string) =>
      api.post<AlmocoDoDia>("/almocos/manual", { colaborador_id }),
    onSuccess: () => {
      recarregar();
      setManualAberto(false);
    },
  });

  /** Correção de leitura feita por engano: volta para pendente, não cancela. */
  const desfazer = useMutation({
    mutationFn: (id: string) => api.post<AlmocoDoDia>(`/almocos/${id}/desfazer`),
    onSuccess: recarregar,
  });

  /** Só bookkeeping: o visitante já comeu, isso não libera nem bloqueia nada. */
  const confirmarPix = useMutation({
    mutationFn: (id: string) => api.post<AlmocoDoDia>(`/almocos/${id}/confirmar-pix`),
    onSuccess: recarregar,
  });

  const linhas = almocos.data?.itens ?? [];
  const total = almocos.data?.total ?? 0;
  const confirmados = confirmadosCount.data?.total ?? 0;
  const pendentes = pendentesCount.data?.total ?? 0;

  const hoje = hojeIso();
  const ocupado = confirmarManual.isPending || desfazer.isPending;

  function formaPagamento(l: LinhaPainel): string {
    if (l.eh_visitante) {
      if (l.almoco.cortesia) return "Cortesia";
      return l.almoco.pix_confirmado_em ? "Pix confirmado" : "Pix pendente";
    }
    return l.almoco.isento ? "Isento (empresa paga)" : "Folha";
  }

  /** O que de fato saiu do bolso de quem consumiu — zero em cortesia e isento. */
  function valorPago(l: LinhaPainel): number {
    return l.almoco.cortesia || l.almoco.isento ? 0 : Number(l.almoco.valor);
  }

  const exportar = useMutation({
    mutationFn: () => buscarTudoPaginado<LinhaPainel>(caminhoLista),
    onSuccess: (todos) => {
      baixarCsv(
        `almocos-f8-${de}_a_${ate}`,
        todos.map((l) => ({
          Data: diaIso(l.almoco.criado_em),
          Colaborador: l.colaborador_nome,
          "Código do colaborador": l.colaborador_codigo,
          Departamento: l.departamento ?? "—",
          Status: l.almoco.status,
          Pagamento: formaPagamento(l),
          "Valor do almoço": l.almoco.valor,
          "Valor pago": valorPago(l),
          Origem: l.almoco.origem,
          "Código de barras": l.almoco.codigo_barras,
          "Gerado em": hora(l.almoco.criado_em),
          "Confirmado em": l.almoco.confirmado_em ? hora(l.almoco.confirmado_em) : "—",
        })),
      );
    },
  });

  const erro =
    confirmarManual.error ?? desfazer.error ?? confirmarPix.error ?? almocos.error ?? exportar.error;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">Almoços</h1>
        <div className="flex gap-2">
          <Button variant="destaque" onClick={() => setManualAberto(true)}>
            <ScanBarcode />
            Confirmar sem leitor
          </Button>
          <Button
            variant="outline"
            onClick={() => exportar.mutate()}
            disabled={total === 0 || exportar.isPending}
          >
            {exportar.isPending ? "Exportando…" : "Exportar"}
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <PrecoDoAlmoco />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-sm">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-suave">Confirmados</p>
            <p className="mt-1 text-2xl font-bold text-sucesso">{confirmados}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-suave">Aguardando</p>
            <p className="mt-1 text-2xl font-bold">{pendentes}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <FiltroPeriodo valor={filtro} aoMudar={setFiltro} />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou código"
          className="w-full sm:w-64"
        />
      </div>

      {erro && (
        <div className="mb-4">
          <Aviso>{mensagemDeErro(erro, AVISOS)}</Aviso>
        </div>
      )}

      {almocos.isLoading && <Carregando />}
      {almocos.data && linhas.length === 0 && <Vazio>Nenhum almoço neste recorte.</Vazio>}

      {linhas.length > 0 && (
        <Card className="overflow-x-auto">
          <Table className="tabela-admin">
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Gerado</TableHead>
                <TableHead>Confirmado</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map(({ almoco, colaborador_nome, colaborador_codigo, departamento, eh_visitante }) => {
                const dia = diaIso(almoco.criado_em);
                return (
                  <TableRow key={almoco.id}>
                    <TableCell className="text-sm">{dia}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold">{colaborador_nome}</p>
                        {eh_visitante && (
                          <Badge variant="outline" className="text-[10px]">
                            visitante
                          </Badge>
                        )}
                        {almoco.cortesia && (
                          <Badge variant="secondary" className="text-[10px]">
                            cortesia
                          </Badge>
                        )}
                        {almoco.isento && (
                          <Badge variant="secondary" className="text-[10px]">
                            empresa paga
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-suave">{colaborador_codigo}</p>
                      {almoco.pix_txid && !almoco.cortesia && (
                        <p className="text-[11px]">
                          {almoco.pix_confirmado_em ? (
                            <span className="text-sucesso">Pix confirmado</span>
                          ) : (
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-[11px] text-suave"
                              onClick={() => confirmarPix.mutate(almoco.id)}
                              disabled={confirmarPix.isPending}
                            >
                              Confirmar Pix
                            </Button>
                          )}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-suave">{departamento ?? "—"}</TableCell>
                    <TableCell className="text-sm text-suave">{almoco.origem}</TableCell>
                    <TableCell className="text-sm">{hora(almoco.criado_em)}</TableCell>
                    <TableCell className="text-sm">
                      {almoco.confirmado_em ? hora(almoco.confirmado_em) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          almoco.status === "confirmado"
                            ? "default"
                            : almoco.status === "pendente"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {almoco.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {dia !== hoje ? (
                        <span className="text-[11px] text-muito-suave">—</span>
                      ) : almoco.status === "confirmado" ? (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-[11px] text-suave"
                          onClick={() => desfazer.mutate(almoco.id)}
                          disabled={ocupado}
                        >
                          Desfazer
                        </Button>
                      ) : eh_visitante ? (
                        <span className="text-[11px] text-muito-suave">aguardando leitura</span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => confirmarManual.mutate(almoco.colaborador_id!)}
                          disabled={ocupado}
                        >
                          Confirmar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <PaginacaoControles
            pagina={pagina}
            porPagina={POR_PAGINA}
            total={total}
            aoMudar={setPagina}
          />
        </Card>
      )}

      <Dialog open={manualAberto} onOpenChange={setManualAberto}>
        <DialogContent>
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
            aoEscolher={(pessoa) => confirmarManual.mutate(pessoa.id)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
