import type { ReactNode } from "react";

export function Aviso({ tom = "erro", children }: { tom?: "erro" | "ok"; children: ReactNode }) {
  const cores =
    tom === "ok"
      ? "border-sucesso/30 bg-sucesso/10 text-sucesso"
      : "border-perigo/30 bg-perigo/10 text-perigo";
  return <p className={`rounded-lg border px-3 py-2 text-sm font-medium ${cores}`}>{children}</p>;
}
