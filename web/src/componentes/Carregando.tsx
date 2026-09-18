export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return <p className="p-6 text-sm text-suave">{texto}</p>;
}
