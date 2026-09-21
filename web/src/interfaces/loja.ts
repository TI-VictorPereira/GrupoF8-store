/** Vitrine, carrinho e pedidos da loja interna. */

export type StatusPedido = "pendente" | "entregue" | "cancelado";

export interface Categoria {
  id: string;
  nome: string;
}

export interface ProdutoVitrine {
  id: string;
  nome: string;
  categoria_id: string | null;
  preco_venda: string;
  estoque: number;
  foto_url: string | null;
}

/**
 * Item de um pedido.
 *
 * Não tem `id`: a API devolve o retrato do item, não a linha do banco. Quem
 * precisar de chave de lista usa produto_id + posição — o mesmo produto não
 * aparece duas vezes no mesmo pedido, mas produto removido vem com null.
 */
export interface ItemPedido {
  produto_id: string | null;
  nome_produto: string;
  categoria: string | null;
  quantidade: number;
  preco_unitario: string;
  custo_unitario: string;
}

export interface Pedido {
  id: string;
  codigo_retirada: string;
  valor_total: string;
  criado_em: string;
  status: StatusPedido;
  itens: ItemPedido[];
}

/** O POST /pedidos devolve só o identificador; o detalhe vem depois. */
export interface PedidoCriado {
  id: string;
}
