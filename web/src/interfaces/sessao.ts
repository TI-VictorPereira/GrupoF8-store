/** Quem está logado e o que ele pode fazer. */

import type { CorteCiclo } from "@/comum/periodo";

export type Papel = "colaborador" | "entregador" | "refeitorio" | "dp" | "admin";

export interface Empresa {
  id: string;
  codemp: number;
  nome: string;
}

export interface Eu {
  id: string;
  nome_completo: string;
  codigo: string;
  papel: Papel;
  senha_provisoria: boolean;
  termos_pendentes: boolean;
  empresa: Empresa | null;
  cortes_ciclo: CorteCiclo[];
}
