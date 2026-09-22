import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/componentes/ui/button";
import { PAGINA_APP } from "@/comum/layout";
import { cn } from "@/comum/utilitarios";

/** Barra de topo das telas internas: sangra na largura toda, conteúdo no centro. */
export function Cabecalho({
  titulo,
  voltarPara = "/",
}: {
  titulo: string;
  voltarPara?: LinkProps["to"];
}) {
  return (
    <header className="border-b border-borda bg-card">
      <div className={cn(PAGINA_APP, "flex items-center gap-2 py-3")}>
        <Button asChild variant="ghost" size="icon" aria-label="Voltar">
          <Link to={voltarPara}>
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="text-sm font-bold">{titulo}</h1>
      </div>
    </header>
  );
}
