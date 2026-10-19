import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { Button } from "@/componentes/ui/button";
import { Label } from "@/componentes/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/componentes/ui/select";
import { mensagemDeErro } from "@/comum/erros";

interface PessoaComConsumo {
  colaborador_id: string;
  departamento_id: string | null;
  nome: string;
  departamento: string | null;
}

type Recorte = "todos" | "area" | "pessoa";

const SEM_AREA = "sem-area";
const AVISOS: Record<string, string> = {
  nada_para_assinar: "Ninguém nesse recorte consumiu nada no ciclo.",
};

function nomeDeArquivo(texto: string): string {
  return texto.replace(/[\\/:*?"<>|]+/g, " ").trim() || "sem nome";
}

/** PDF por pessoa para colher assinatura: uma pessoa, uma área (zip) ou todos (zip por área). */
export function ArquivosDeAssinatura({ competencia }: { competencia: string }) {
  const [recorte, setRecorte] = useState<Recorte>("todos");
  const [escolha, setEscolha] = useState("");

  const pessoas = useQuery({
    queryKey: ["folhas-assinatura", competencia],
    queryFn: () =>
      api.get<PessoaComConsumo[]>(`/exportacoes/folha/assinaturas?competencia=${competencia}`),
  });

  const areas = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of pessoas.data ?? []) {
      mapa.set(p.departamento_id ?? SEM_AREA, p.departamento ?? "Sem departamento");
    }
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [pessoas.data]);

  const baixar = useMutation({
    mutationFn: () => {
      const base = `/exportacoes/folha/assinaturas/arquivo?competencia=${competencia}`;
      if (recorte === "pessoa") {
        const pessoa = pessoas.data?.find((p) => p.colaborador_id === escolha);
        return api.baixar(`${base}&colaborador_id=${escolha}`, `${nomeDeArquivo(pessoa?.nome ?? "")}.pdf`);
      }
      if (recorte === "area") {
        const area = areas.find(([id]) => id === escolha)?.[1] ?? "";
        return api.baixar(`${base}&departamento_id=${escolha}`, `${nomeDeArquivo(area)}.zip`);
      }
      return api.baixar(base, "Grupo F8.zip");
    },
  });

  function mudarRecorte(valor: string) {
    setRecorte(valor as Recorte);
    setEscolha("");
    baixar.reset();
  }

  const opcoes =
    recorte === "area"
      ? areas.filter(([id]) => id !== SEM_AREA)
      : (pessoas.data ?? []).map((p) => [p.colaborador_id, p.nome] as const);
  const pronto = recorte === "todos" || !!escolha;

  return (
    <div className="mt-4 border-t border-borda pt-4">
      <h3 className="text-sm font-bold">Folhas de assinatura</h3>
      <p className="mt-0.5 text-[11px] text-suave">
        Um PDF por pessoa, com o consumo dia a dia e o campo de assinatura.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="recorte-assinatura">Gerar para</Label>
          <Select value={recorte} onValueChange={mudarRecorte}>
            <SelectTrigger id="recorte-assinatura" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="area">Um departamento</SelectItem>
              <SelectItem value="pessoa">Um funcionário</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {recorte !== "todos" && (
          <div className="grid w-full gap-1.5 sm:w-64">
            <Label htmlFor="escolha-assinatura">
              {recorte === "area" ? "Departamento" : "Funcionário"}
            </Label>
            <Select value={escolha} onValueChange={setEscolha}>
              <SelectTrigger id="escolha-assinatura">
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {opcoes.map(([id, nome]) => (
                  <SelectItem key={id} value={id}>
                    {nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button
          variant="outline"
          onClick={() => baixar.mutate()}
          disabled={!pronto || baixar.isPending || !pessoas.data?.length}
        >
          {baixar.isPending ? "Gerando…" : "Baixar"}
        </Button>
      </div>
      {pessoas.data?.length === 0 && (
        <p className="mt-2 text-[11px] text-suave">Ninguém consumiu nada neste ciclo.</p>
      )}
      {baixar.error && (
        <div className="mt-2">
          <Aviso>{mensagemDeErro(baixar.error, AVISOS)}</Aviso>
        </div>
      )}
    </div>
  );
}
