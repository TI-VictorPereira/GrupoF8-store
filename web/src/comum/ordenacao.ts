import { useState } from "react";

export type Direcao = "asc" | "desc";

export interface EstadoOrdenacao<Coluna extends string> {
  coluna: Coluna;
  direcao: Direcao;
}

export function useOrdenacao<Coluna extends string>(colunaInicial: Coluna) {
  const [estado, setEstado] = useState<EstadoOrdenacao<Coluna>>({
    coluna: colunaInicial,
    direcao: "asc",
  });

  function alternar(coluna: Coluna) {
    setEstado((atual) =>
      atual.coluna === coluna
        ? { coluna, direcao: atual.direcao === "asc" ? "desc" : "asc" }
        : { coluna, direcao: "asc" },
    );
  }

  return { ...estado, alternar };
}

export function ordenar<T, Coluna extends string>(
  linhas: readonly T[],
  estado: EstadoOrdenacao<Coluna>,
  valorDe: (linha: T, coluna: Coluna) => string | number,
): T[] {
  const sinal = estado.direcao === "asc" ? 1 : -1;
  return [...linhas].sort((a, b) => {
    const va = valorDe(a, estado.coluna);
    const vb = valorDe(b, estado.coluna);
    if (va === vb) return 0;
    return va > vb ? sinal : -sinal;
  });
}
