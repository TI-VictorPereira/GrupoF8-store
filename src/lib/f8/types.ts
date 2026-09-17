export type PapelUsuario = "colaborador" | "refeitorio" | "admin";
export type PedidoStatus = "pendente" | "entregue" | "cancelado";
export type AlmocoStatus = "pendente" | "confirmado" | "expirado" | "cancelado";
export type AlmocoOrigem = "totem" | "manual";

export interface Departamento {
  id: string;
  nome: string;
}

export interface CategoriaProduto {
  id: string;
  nome: string;
}

export interface Colaborador {
  id: string;
  nome_completo: string;
  codigo: string;
  papel: PapelUsuario;
  departamento_id: string | null;
  empresa: string;
  ativo: boolean;
  criado_em: string;
  matricula?: string | null;
  senha_provisoria?: boolean;
}

export interface Produto {
  id: string;
  nome: string;
  codigo: string;
  categoria_id: string | null;
  custo: number;
  preco_venda: number;
  estoque: number;
  foto_url: string | null;
  ativo: boolean;
}

export interface ItemPedido {
  id: string;
  pedido_id: string;
  produto_id: string | null;
  nome_produto: string;
  categoria: string | null;
  quantidade: number;
  preco_unitario: number;
  custo_unitario: number;
}

export interface Pedido {
  id: string;
  colaborador_id: string;
  valor_total: number;
  status: PedidoStatus;
  codigo_retirada: string;
  criado_em: string;
  entregue_em: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  itens?: ItemPedido[];
}

export interface Almoco {
  id: string;
  colaborador_id: string;
  codigo_barras: string;
  status: AlmocoStatus;
  origem: AlmocoOrigem;
  criado_em: string;
  expira_em: string;
  confirmado_em: string | null;
}

export interface Sessao {
  papel: PapelUsuario;
  colaborador?: Colaborador;
  nome: string;
}
