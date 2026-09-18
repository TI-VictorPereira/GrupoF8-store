import type { ReactNode } from "react";

/** Estado vazio de uma lista — nem erro, nem carregando: não há nada. */
export function Vazio({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-borda px-4 py-8 text-center text-sm text-suave">
      {children}
    </p>
  );
}
