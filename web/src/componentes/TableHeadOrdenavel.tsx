import { ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";

import { TableHead } from "@/componentes/ui/table";
import type { EstadoOrdenacao } from "@/comum/ordenacao";
import { cn } from "@/comum/utilitarios";

export function TableHeadOrdenavel<Coluna extends string>({
  coluna,
  estado,
  aoClicar,
  children,
  className,
}: {
  coluna: Coluna;
  estado: EstadoOrdenacao<Coluna>;
  aoClicar: (coluna: Coluna) => void;
  children: ReactNode;
  className?: string;
}) {
  const ativa = estado.coluna === coluna;
  return (
    <TableHead className={cn("p-0", className)}>
      <button
        type="button"
        onClick={() => aoClicar(coluna)}
        className="flex h-10 w-full items-center gap-1 px-2 text-left font-medium hover:text-suave"
      >
        {children}
        {ativa ? (
          <ArrowUp
            className={cn("size-3.5 shrink-0 transition-transform", estado.direcao === "desc" && "rotate-180")}
          />
        ) : (
          <ArrowUpDown className="size-3.5 shrink-0 opacity-30" />
        )}
      </button>
    </TableHead>
  );
}
