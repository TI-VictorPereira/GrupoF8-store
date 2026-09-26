import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/cliente";
import { Help } from "@/componentes/Help";
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


export function FiltroPeriodo({
  valor,
  aoMudar,
}: {
  valor: EstadoPeriodo;
  aoMudar: (estado: EstadoPeriodo) => void;
}) {

  const ciclos = useQuery({
    queryKey: ["competencias-empresa"],
    queryFn: () => api.get<string[]>("/consumo/competencias/empresa"),
  });

  return (
    <div className="flex flex-wrap items-end gap-2">
      {ROTULOS_PERIODO.map((opcao) => (
        <span key={opcao.valor} className="inline-flex items-center gap-1">
          <Button
            size="sm"
            variant={valor.periodo === opcao.valor ? "default" : "outline"}
            onClick={() => aoMudar({ ...valor, periodo: opcao.valor })}
          >
            {opcao.rotulo}
          </Button>
          {opcao.valor === "ciclo" && (
            <Help>
              O ciclo vai do dia 21 ao dia 20 do mês seguinte, e leva o nome do mês em que
              fecha — mesma regra da folha de pagamento. Quem comprou ou almoçou em 25 de
              agosto está no ciclo de setembro.
            </Help>
          )}
        </span>
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
