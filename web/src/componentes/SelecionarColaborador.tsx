import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";

import { api } from "@/api/cliente";
import { Button } from "@/componentes/ui/button";
import { Input } from "@/componentes/ui/input";
import type { ColaboradorParaAlmoco } from "@/interfaces/refeitorio";

/**
 * Busca e mantém um colaborador escolhido, sem agir sozinha — quem decide o
 * que fazer com a escolha é o formulário que envolve este componente.
 *
 * Diferente de `BuscarColaborador`: aquela dispara uma ação assim que a linha
 * é clicada (confirmar almoço na hora). Esta guarda a escolha em estado até o
 * formulário ser enviado, útil quando ainda falta preencher outros campos.
 */
export function SelecionarColaborador({
  selecionado,
  aoSelecionar,
  placeholder = "Buscar por nome ou código",
}: {
  selecionado: ColaboradorParaAlmoco | null;
  aoSelecionar: (pessoa: ColaboradorParaAlmoco | null) => void;
  placeholder?: string;
}) {
  const [termo, setTermo] = useState("");
  const curto = termo.trim().length < 2;

  const busca = useQuery({
    queryKey: ["busca-colaborador", termo.trim()],
    queryFn: () =>
      api.get<ColaboradorParaAlmoco[]>(
        `/almocos/colaboradores?busca=${encodeURIComponent(termo.trim())}`,
      ),
    enabled: !curto,
  });

  if (selecionado) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-input px-3 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{selecionado.nome_completo}</p>
          <p className="truncate text-[11px] text-suave">{selecionado.codigo}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label="Remover seleção"
          onClick={() => aoSelecionar(null)}
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Input
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {!curto && (busca.data?.length ?? 0) > 0 && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-borda">
          {busca.data!.map((pessoa) => (
            <button
              key={pessoa.id}
              type="button"
              onClick={() => {
                aoSelecionar(pessoa);
                setTermo("");
              }}
              className="block w-full border-b border-borda px-2.5 py-1.5 text-left text-xs last:border-b-0 hover:bg-muted"
            >
              <span className="block font-semibold">{pessoa.nome_completo}</span>
              <span className="block text-suave">{pessoa.codigo}</span>
            </button>
          ))}
        </div>
      )}
      {!curto && busca.data?.length === 0 && (
        <p className="mt-1 text-[11px] text-suave">Ninguém encontrado.</p>
      )}
    </div>
  );
}
