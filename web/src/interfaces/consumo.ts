/** Extrato mensal — a mesma forma que alimenta a exportação para o Sankhya. */

import type { StatusAlmoco } from "@/interfaces/almoco";
import type { StatusPedido } from "@/interfaces/loja";

export type TipoLancamento = "loja" | "almoco";

export interface Lancamento {
  id: string;
  tipo: TipoLancamento;
  data: string;
  descricao: string;
  valor: string;
  status: StatusPedido | StatusAlmoco;
}

export interface Extrato {
  competencia: string;
  total_loja: string;
  total_almocos: string;
  quantidade_almocos: number;
  lancamentos: Lancamento[];
  /** Só vem no ciclo aberto e só para quem tem limite. */
  limite_loja: string | null;
  disponivel_loja: string | null;
}
