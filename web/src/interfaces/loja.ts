/** Vitrine, carrinho e pedidos da loja interna. */

export type StatusPedido = "pendente" | "entregue" | "cancelado";

export interface Categoria {
  id: string;
  nome: string;
}

export interface Marca {
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
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  itens: ItemPedido[];
}

export interface PedidoCriado {
  id: string;
}
