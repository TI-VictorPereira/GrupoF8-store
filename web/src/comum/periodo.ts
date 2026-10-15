/** Intervalos de data usados pelas telas de relatório. */

export type Periodo = "hoje" | "7dias" | "ciclo" | "geral" | "personalizado";

const INICIO_DOS_TEMPOS = "2000-01-01";


export interface CorteCiclo {
  dia: number;
  primeira_competencia: string;
  vigente_desde: string;
}

// Mesma regra do backend (app/modules/ciclo.py). Chega junto com a sessão e
// fica aqui para as funções puras de período não dependerem de hook.
let cortes: CorteCiclo[] = [
  { dia: 15, primeira_competencia: "2000-01", vigente_desde: "2000-01-01T03:00:00Z" },
];

export function definirCortes(novos: CorteCiclo[]): void {
  if (novos.length) cortes = novos;
}

export function corteVigente(): CorteCiclo {
  return cortes.filter((c) => new Date(c.vigente_desde) <= new Date()).at(-1) ?? cortes[0]!;
}

export function proximoCorte(): CorteCiclo | undefined {
  return cortes.find((c) => new Date(c.vigente_desde) > new Date());
}

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
  const corte = cortes.filter((c) => new Date(c.vigente_desde) <= data).at(-1) ?? cortes[0]!;
  const deslocamento = data.getDate() > corte.dia ? 1 : 0;
  const calculada = rotulo(new Date(data.getFullYear(), data.getMonth() + deslocamento, 1));
  return calculada > corte.primeira_competencia ? calculada : corte.primeira_competencia;
}

/** Varre os dias em volta do mês: na troca de dia, um ciclo pode ser mais curto ou mais longo. */
export function cicloDe(competencia: string): { de: string; ate: string } {
  const [ano, mes] = competencia.split("-").map(Number);
  const dias: Date[] = [];
  for (const dia = new Date(ano!, mes! - 3, 1); dia <= new Date(ano!, mes! + 1, 0); dia.setDate(dia.getDate() + 1)) {
    if (competenciaDe(dia) === competencia) dias.push(new Date(dia));
  }
  if (!dias.length) return { de: `${competencia}-01`, ate: `${competencia}-01` };
  return { de: iso(dias[0]!), ate: iso(dias.at(-1)!) };
}

export function intervaloDe(periodo: Periodo): { de: string; ate: string } {
  const hoje = new Date();
  if (periodo === "7dias") {
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - 6);
    return { de: iso(inicio), ate: iso(hoje) };
  }
  if (periodo === "ciclo") return cicloDe(competenciaDe(hoje));
  if (periodo === "geral") return { de: INICIO_DOS_TEMPOS, ate: iso(hoje) };
  return { de: iso(hoje), ate: iso(hoje) };
}


export const ROTULOS_PERIODO: { valor: Periodo; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "7dias", rotulo: "7 dias" },
  { valor: "ciclo", rotulo: "Ciclo" },
  { valor: "geral", rotulo: "Geral" },
  { valor: "personalizado", rotulo: "Escolher datas" },
];

export interface EstadoPeriodo {
  periodo: Periodo;
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
