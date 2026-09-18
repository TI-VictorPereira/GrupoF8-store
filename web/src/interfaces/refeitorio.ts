/** Painel do refeitório: a fila do dia e a busca do lançamento manual. */

import type { AlmocoDoDia } from "@/interfaces/almoco";

export interface LinhaPainel {
  almoco: AlmocoDoDia;
  colaborador_nome: string;
  colaborador_codigo: string;
  departamento: string | null;
}

/** Menos campos que o cadastro do admin — o refeitório só precisa identificar. */
export interface ColaboradorParaAlmoco {
  id: string;
  nome_completo: string;
  codigo: string;
  departamento: string | null;
}
