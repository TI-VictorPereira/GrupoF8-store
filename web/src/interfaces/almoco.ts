/** Liberação do almoço do dia. */

export type StatusAlmoco = "pendente" | "confirmado" | "expirado" | "cancelado";

export interface AlmocoDoDia {
  id: string;
  colaborador_id: string;
  codigo_barras: string;
  status: StatusAlmoco;
  /** "totem" quando o colaborador gerou, "manual" quando o refeitório lançou. */
  origem: string;
  valor: string;
  criado_em: string;
  expira_em: string;
  confirmado_em: string | null;
  confirmado_por: string | null;
}
