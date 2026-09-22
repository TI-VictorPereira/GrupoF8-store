import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanBarcode } from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { BuscarColaborador } from "@/componentes/BuscarColaborador";
import { Carregando } from "@/componentes/Carregando";
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
import { Label } from "@/componentes/ui/label";
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
import { diaIso, hojeIso } from "@/comum/periodo";
import { baixarCsv } from "@/comum/planilha";
import type { AlmocoDoDia } from "@/interfaces/almoco";
import type { LinhaPainel } from "@/interfaces/refeitorio";

const AVISOS: Record<string, string> = {
  periodo_invalido: "A data final não pode ser anterior à inicial.",
  almoco_ja_confirmado: "Esta pessoa já teve o almoço confirmado hoje.",
  almoco_ja_gerado_hoje: "Esta pessoa já tem almoço lançado hoje.",
  almoco_nao_confirmado: "Este almoço não está confirmado.",
};

export function Almocos() {
  const clienteConsulta = useQueryClient();
  const [de, setDe] = useState(hojeIso);
  const [ate, setAte] = useState(hojeIso);
  const [busca, setBusca] = useState("");
  const [manualAberto, setManualAberto] = useState(false);

  const almocos = useQuery({
    queryKey: ["almocos-historico", de, ate],
    queryFn: () => api.get<LinhaPainel[]>(`/almocos?de=${de}&ate=${ate}`),
  });

  /**
   * O mesmo almoço aparece em três telas: aqui, no painel do refeitório e no
   * contador da barra de navegação. Confirmar num lugar precisa apagar o
   * "aguardando" nos outros dois, senão o admin confirma e continua vendo a
   * pessoa na fila.
   */
  function recarregar() {
    void clienteConsulta.invalidateQueries({ queryKey: ["almocos-historico"] });
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

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (almocos.data ?? []).filter(
      (l) =>
        !termo ||
        l.colaborador_nome.toLowerCase().includes(termo) ||
        l.colaborador_codigo.toLowerCase().includes(termo),
    );
  }, [almocos.data, busca]);

  const confirmados = linhas.filter((l) => l.almoco.status === "confirmado").length;
  const pendentes = linhas.filter((l) => l.almoco.status === "pendente").length;

  
  const hoje = hojeIso();
  const ocupado = confirmarManual.isPending || desfazer.isPending;

  function exportar() {
    baixarCsv(
      `almocos-f8-${de}_a_${ate}`,
      linhas.map((l) => ({
        Data: diaIso(l.almoco.criado_em),
        Colaborador: l.colaborador_nome,
        "Código do colaborador": l.colaborador_codigo,
        Departamento: l.departamento ?? "—",
        Status: l.almoco.status,
        Origem: l.almoco.origem,
        "Código de barras": l.almoco.codigo_barras,
        "Gerado em": hora(l.almoco.criado_em),
        "Confirmado em": l.almoco.confirmado_em ? hora(l.almoco.confirmado_em) : "—",
      })),
    );
  }

  const erro = confirmarManual.error ?? desfazer.error ?? almocos.error;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">Almoços</h1>
        <div className="flex gap-2">
          <Button variant="destaque" onClick={() => setManualAberto(true)}>
            <ScanBarcode />
            Confirmar sem leitor
          </Button>
          <Button variant="outline" onClick={exportar} disabled={linhas.length === 0}>
            Exportar
          </Button>
        </div>
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
        <div className="grid gap-1.5">
          <Label htmlFor="de">De</Label>
          <Input id="de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ate">Até</Label>
          <Input id="ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
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
              {linhas.map(({ almoco, colaborador_nome, colaborador_codigo, departamento }) => {
                const dia = diaIso(almoco.criado_em);
                return (
                  <TableRow key={almoco.id}>
                    <TableCell className="text-sm">{dia}</TableCell>
                    <TableCell>
                      <p className="text-sm font-semibold">{colaborador_nome}</p>
                      <p className="text-[11px] text-suave">{colaborador_codigo}</p>
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
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => confirmarManual.mutate(almoco.colaborador_id)}
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
