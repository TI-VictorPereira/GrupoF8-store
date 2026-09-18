import { Link } from "@tanstack/react-router";

export function Cabecalho({
  titulo,
  voltarPara = "/",
}: {
  titulo: string;
  voltarPara?: string;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-borda px-5 py-4">
      <Link to={voltarPara} className="text-lg leading-none text-suave" aria-label="Voltar">
        ←
      </Link>
      <h1 className="text-sm font-bold">{titulo}</h1>
    </header>
  );
}
