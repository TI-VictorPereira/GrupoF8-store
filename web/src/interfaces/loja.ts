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

export interface ItemPedido {
  id: string;
  nome_produto: string;
  quantidade: number;
  preco_unitario: string;
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
