const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** A API devolve dinheiro como string para não perder precisão no JSON. */
export function dinheiro(valor: string | number): string {
  return MOEDA.format(Number(valor));
}

export function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function dataHora(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${hora(iso)}`;
}

export function mesPorExtenso(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  return new Date(ano!, mes! - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}
