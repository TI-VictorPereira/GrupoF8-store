import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { CampoInteiro } from "@/componentes/CampoInteiro";
import { Button } from "@/componentes/ui/button";
import { Card, CardContent } from "@/componentes/ui/card";
import { Label } from "@/componentes/ui/label";
import { mensagemDeErro } from "@/comum/erros";
import { corteVigente, proximoCorte } from "@/comum/periodo";
import { CHAVE_EU } from "@/hooks/sessao";

const AVISOS: Record<string, string> = {
  dia_de_corte_invalido: "O dia de fechamento precisa estar entre 1 e 27.",
};

function mesAno(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

/** Só o admin troca. O dia novo vale a partir do próximo ciclo. */
export function DiaDeFechamento() {
  const clienteConsulta = useQueryClient();
  const vigente = corteVigente();
  const proximo = proximoCorte();
  const [dia, setDia] = useState("");

  const salvar = useMutation({
    mutationFn: () => api.put("/consumo/ciclo", { dia: Number(dia) }),
    onSuccess: () => {
      setDia("");
      void clienteConsulta.invalidateQueries({ queryKey: CHAVE_EU });
    },
  });

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <h2 className="text-sm font-bold">Dia de fechamento do ciclo</h2>
        <p className="mt-1 text-sm text-suave">
          Hoje o ciclo fecha no dia {vigente.dia}.
          {proximo &&
            ` A partir do ciclo de ${mesAno(proximo.primeira_competencia)}, fecha no dia ${proximo.dia}.`}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="dia-fechamento">Novo dia</Label>
            <CampoInteiro
              id="dia-fechamento"
              valor={dia}
              aoMudar={setDia}
              placeholder="1 a 27"
              className="w-28"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => salvar.mutate()}
            disabled={!dia || salvar.isPending}
          >
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-suave">
          O ciclo aberto fecha como começou. O dia novo vale a partir do próximo, e o que já
          aconteceu não muda de ciclo.
        </p>
        {salvar.error && (
          <div className="mt-2">
            <Aviso>{mensagemDeErro(salvar.error, AVISOS)}</Aviso>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
