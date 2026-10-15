/** Contratos usados por mais de uma tela. */

/** Envelope de listagem paginada. `total` é a contagem real no banco. */
export interface Pagina<T> {
  itens: T[];
  total: number;
}
