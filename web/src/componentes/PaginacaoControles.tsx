import { Button } from "@/componentes/ui/button";

interface PaginacaoControlesProps {
  pagina: number;
  porPagina: number;
  total: number;
  aoMudar: (pagina: number) => void;
}

/** Fica abaixo de qualquer lista paginada — tabela ou grid de cards. */
export function PaginacaoControles({ pagina, porPagina, total, aoMudar }: PaginacaoControlesProps) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  if (totalPaginas <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borda px-1 py-3">
      <p className="text-[11px] text-suave">
        Página {pagina} de {totalPaginas} · {total} {total === 1 ? "registro" : "registros"}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => aoMudar(pagina - 1)}
          disabled={pagina <= 1}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => aoMudar(pagina + 1)}
          disabled={pagina >= totalPaginas}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
