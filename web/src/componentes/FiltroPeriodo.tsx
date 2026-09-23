import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/cliente";
import { Button } from "@/componentes/ui/button";
import { Input } from "@/componentes/ui/input";
import { Label } from "@/componentes/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/componentes/ui/select";
import { diaMes, mesPorExtenso } from "@/comum/formato";
import { ROTULOS_PERIODO, cicloDe, type EstadoPeriodo } from "@/comum/periodo";

/**
 * Filtro de período das telas de relatório.
 *
 * Vive fora das telas porque vendas e almoços recortam o mesmo tempo: o mês
 * do consumo fecha no dia 20 para os dois, e um almoço confirmado em 21/09
 * entra no mesmo ciclo que uma compra feita no mesmo dia. Duas cópias deste
 * controle acabariam divergindo, e a divergência apareceria como dois totais
 * diferentes para o que deveria ser o mesmo período.
 */
export function FiltroPeriodo({
  valor,
  aoMudar,
}: {
  valor: EstadoPeriodo;
  aoMudar: (estado: EstadoPeriodo) => void;
}) {
  // Só os ciclos com movimento: uma lista de meses vazios não ajuda ninguém a
  // decidir o que olhar ou exportar.
  const ciclos = useQuery({
    queryKey: ["competencias-empresa"],
    queryFn: () => api.get<string[]>("/consumo/competencias/empresa"),
  });

  return (
    <div className="flex flex-wrap items-end gap-2">
      {ROTULOS_PERIODO.map((opcao) => (
        <Button
          key={opcao.valor}
          size="sm"
          variant={valor.periodo === opcao.valor ? "default" : "outline"}
          onClick={() => aoMudar({ ...valor, periodo: opcao.valor })}
        >
          {opcao.rotulo}
        </Button>
      ))}

      {valor.periodo === "ciclo" && (
        <Select value={valor.ciclo} onValueChange={(ciclo) => aoMudar({ ...valor, ciclo })}>
          <SelectTrigger aria-label="Ciclo" className="w-[17rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(ciclos.data ?? [valor.ciclo]).map((competencia) => {
              const faixa = cicloDe(competencia);
              return (
                <SelectItem key={competencia} value={competencia}>
                  {mesPorExtenso(competencia)} · {diaMes(faixa.de)} a {diaMes(faixa.ate)}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      )}

      {valor.periodo === "personalizado" && (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="periodo-de">De</Label>
            <Input
              id="periodo-de"
              type="date"
              value={valor.personalizado.de}
              onChange={(e) =>
                aoMudar({
                  ...valor,
                  personalizado: { ...valor.personalizado, de: e.target.value },
                })
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="periodo-ate">Até</Label>
            <Input
              id="periodo-ate"
              type="date"
              value={valor.personalizado.ate}
              onChange={(e) =>
                aoMudar({
                  ...valor,
                  personalizado: { ...valor.personalizado, ate: e.target.value },
                })
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
