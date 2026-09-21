import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/componentes/ui/button";

export function Cabecalho({
  titulo,
  voltarPara = "/",
}: {
  titulo: string;
  voltarPara?: LinkProps["to"];
}) {
  return (
    <header className="flex items-center gap-2 border-b border-borda px-4 py-3">
      <Button asChild variant="ghost" size="icon" aria-label="Voltar">
        <Link to={voltarPara}>
          <ArrowLeft />
        </Link>
      </Button>
      <h1 className="text-sm font-bold">{titulo}</h1>
    </header>
  );
}
