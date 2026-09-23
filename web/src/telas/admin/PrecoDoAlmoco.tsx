import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { CampoDinheiro } from "@/componentes/CampoDinheiro";
import { Button } from "@/componentes/ui/button";
import { Card, CardContent } from "@/componentes/ui/card";
import { Label } from "@/componentes/ui/label";
import { mensagemDeErro } from "@/comum/erros";
import { dinheiro } from "@/comum/formato";

interface Preco {
  id: string;
  valor: string;
  vigencia_inicio: string;
  vigencia_fim: string | null;
}

function porExtenso(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}


export function PrecoDoAlmoco() {
  const clienteConsulta = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("0.00");

  const preco = useQuery({
    queryKey: ["preco-almoco"],
    queryFn: () => api.get<Preco | null>("/almocos/preco"),
  });

  const salvar = useMutation({
    mutationFn: () => api.put<Preco>("/almocos/preco", { valor }),
    onSuccess: () => {
      void clienteConsulta.invalidateQueries({ queryKey: ["preco-almoco"] });
      setEditando(false);
    },
  });

  const atual = preco.data;
  const zerado = !atual || Number(atual.valor) === 0;

  function abrir() {
    setValor(atual?.valor ?? "0.00");
    setEditando(true);
  }

  return (
    <Card>
      <CardContent className="p-4">
        {!editando ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-suave">Preço do almoço</p>
              <p className="mt-0.5 text-2xl font-bold">{dinheiro(atual?.valor ?? 0)}</p>
              {atual && (
                <p className="text-[11px] text-muito-suave">
                  Em vigor desde {porExtenso(atual.vigencia_inicio)}
                </p>
              )}
            </div>
            <Button variant={zerado ? "destaque" : "outline"} onClick={abrir}>
              {zerado ? "Definir preço" : "Alterar"}
            </Button>
          </div>
        ) : (
          <div>
            <Label htmlFor="preco-almoco">Novo preço, a partir de hoje</Label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <CampoDinheiro
                id="preco-almoco"
                valor={valor}
                aoMudar={setValor}
                autoFocus
                className="w-32"
              />
              <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                {salvar.isPending ? "Salvando…" : "Salvar"}
              </Button>
              <Button variant="ghost" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-suave">
              Vale para os almoços lançados de agora em diante. Os que já foram confirmados
              mantêm o valor com que foram lançados.
            </p>
          </div>
        )}

        {salvar.error && (
          <div className="mt-3">
            <Aviso>{mensagemDeErro(salvar.error)}</Aviso>
          </div>
        )}

        {zerado && !editando && (
          <div className="mt-3">
            <Aviso>
              Sem preço definido, todo almoço liberado é gravado valendo R$ 0,00 — e definir o
              valor depois não corrige os que já passaram.
            </Aviso>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
