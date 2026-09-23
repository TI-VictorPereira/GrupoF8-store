/** Quem está logado e o que ele pode fazer. */

export type Papel = "colaborador" | "refeitorio" | "dp" | "admin";

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
  empresa: Empresa | null;
}
