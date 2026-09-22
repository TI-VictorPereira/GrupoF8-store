/** Intervalos de data usados pelas telas de relatório. */

export type Periodo = "hoje" | "7dias" | "mes" | "personalizado";

function iso(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

export function hojeIso(): string {
  return iso(new Date());
}


export function diaIso(instante: string): string {
  return iso(new Date(instante));
}

export function intervaloDe(periodo: Periodo): { de: string; ate: string } {
  const hoje = new Date();
  if (periodo === "7dias") {
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - 6);
    return { de: iso(inicio), ate: iso(hoje) };
  }
  if (periodo === "mes") {
    return { de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: iso(hoje) };
  }
  return { de: iso(hoje), ate: iso(hoje) };
}

export const ROTULOS_PERIODO: { valor: Periodo; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "7dias", rotulo: "7 dias" },
  { valor: "mes", rotulo: "Este mês" },
  { valor: "personalizado", rotulo: "Escolher datas" },
];
