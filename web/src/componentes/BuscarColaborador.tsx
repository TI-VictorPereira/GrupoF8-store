import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/cliente";
import { Button } from "@/componentes/ui/button";
import { Input } from "@/componentes/ui/input";
import { Label } from "@/componentes/ui/label";
import type { ColaboradorParaAlmoco } from "@/interfaces/refeitorio";


export function BuscarColaborador({
  rotulo = "Nome ou código do colaborador",
  acao,
  ocupado = false,
  aoEscolher,
}: {
  rotulo?: string;
  /** Texto do botão de cada linha: diz o que acontece ao clicar. */
  acao: string;
  ocupado?: boolean;
  aoEscolher: (pessoa: ColaboradorParaAlmoco) => void;
}) {
  const [termo, setTermo] = useState("");
  const curto = termo.trim().length < 2;

  // O mínimo de duas letras é o mesmo do servidor, que devolve lista vazia
  // abaixo disso. Checar aqui evita a ida inútil a cada tecla.
  const busca = useQuery({
    queryKey: ["busca-colaborador", termo.trim()],
    queryFn: () =>
      api.get<ColaboradorParaAlmoco[]>(
        `/almocos/colaboradores?busca=${encodeURIComponent(termo.trim())}`,
      ),
    enabled: !curto,
  });

  return (
    <div>
      <Label htmlFor="busca-colaborador">{rotulo}</Label>
      <Input
        id="busca-colaborador"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        autoComplete="off"
        autoFocus
        placeholder="Comece a digitar"
        className="mt-1.5"
      />

      {!curto && busca.data?.length === 0 && (
        <p className="mt-3 text-sm text-suave">Ninguém encontrado.</p>
      )}

      <div className="mt-2">
        {(busca.data ?? []).map((pessoa) => (
          <Button
            key={pessoa.id}
            variant="ghost"
            onClick={() => aoEscolher(pessoa)}
            disabled={ocupado}
            className="h-auto w-full justify-between rounded-none border-b border-borda px-2 py-2.5 text-left last:border-b-0"
          >
            <span>
              <span className="block text-sm font-semibold">{pessoa.nome_completo}</span>
              <span className="block text-[11px] text-suave">
                {pessoa.codigo}
                {pessoa.departamento ? ` · ${pessoa.departamento}` : ""}
              </span>
            </span>
            <span className="text-xs font-bold text-suave">{acao} →</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
