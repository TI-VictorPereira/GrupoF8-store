/** Intervalos de data usados pelas telas de relatório. */

export type Periodo = "hoje" | "7dias" | "ciclo" | "personalizado";


export const DIA_CORTE = 20;

function iso(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

function rotulo(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

export function hojeIso(): string {
  return iso(new Date());
}


export function diaIso(instante: string): string {
  return iso(new Date(instante));
}

export function competenciaDe(data: Date): string {
  const deslocamento = data.getDate() > DIA_CORTE ? 1 : 0;
  return rotulo(new Date(data.getFullYear(), data.getMonth() + deslocamento, 1));
}


export function cicloDe(competencia: string): { de: string; ate: string } {
  const [ano, mes] = competencia.split("-").map(Number);
  return {
    de: iso(new Date(ano!, mes! - 2, DIA_CORTE + 1)),
    ate: iso(new Date(ano!, mes! - 1, DIA_CORTE)),
  };
}

export function intervaloDe(periodo: Periodo): { de: string; ate: string } {
  const hoje = new Date();
  if (periodo === "7dias") {
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - 6);
    return { de: iso(inicio), ate: iso(hoje) };
  }
  if (periodo === "ciclo") return cicloDe(competenciaDe(hoje));
  return { de: iso(hoje), ate: iso(hoje) };
}


export const ROTULOS_PERIODO: { valor: Periodo; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "7dias", rotulo: "7 dias" },
  { valor: "ciclo", rotulo: "Ciclo" },
  { valor: "personalizado", rotulo: "Escolher datas" },
];

/** Estado dos três modos do filtro. A tela guarda isto e pergunta o intervalo. */
export interface EstadoPeriodo {
  periodo: Periodo;
  /** Competência escolhida quando o modo é "ciclo". */
  ciclo: string;
  personalizado: { de: string; ate: string };
}

export function periodoInicial(padrao: Periodo = "ciclo"): EstadoPeriodo {
  return {
    periodo: padrao,
    ciclo: competenciaDe(new Date()),
    personalizado: intervaloDe(padrao),
  };
}

export function intervaloDoFiltro(estado: EstadoPeriodo): { de: string; ate: string } {
  if (estado.periodo === "personalizado") return estado.personalizado;
  if (estado.periodo === "ciclo") return cicloDe(estado.ciclo);
  return intervaloDe(estado.periodo);
}
