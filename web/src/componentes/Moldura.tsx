import type { ReactNode } from "react";

/** Moldura das telas do colaborador: largura de celular, centralizada. */
export function Moldura({ children }: { children: ReactNode }) {
  return <div className="mx-auto min-h-screen max-w-md bg-card shadow-sm">{children}</div>;
}
