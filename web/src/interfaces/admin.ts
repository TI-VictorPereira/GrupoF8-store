/** Contratos das telas de administração. */

import type { StatusPedido } from "@/interfaces/loja";
import type { Papel } from "@/interfaces/sessao";

export interface ItemDePedido {
  produto_id: string | null;
  nome_produto: string;
  categoria: string | null;
  quantidade: number;
  preco_unitario: string;
  custo_unitario: string;
}

export interface PedidoCompleto {
  id: string;
  colaborador_id: string;
  valor_total: string;
  status: StatusPedido;
  codigo_retirada: string;
  criado_em: string;
  entregue_em: string | null;
  entregue_por: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  itens: ItemDePedido[];
}

/**
 * Linha da tela de entregas.
 *
 * O pedido vem SEM `codigo_retirada`: ele só prova presença enquanto existir
 * apenas no aparelho de quem comprou. Ver PedidoParaEntregaSaida na API.
 */
export interface PedidoParaEntrega {
  id: string;
  colaborador_id: string;
  valor_total: string;
  status: StatusPedido;
  criado_em: string;
  itens: ItemDePedido[];
}

export interface LinhaEntrega {
  pedido: PedidoParaEntrega;
  colaborador_nome: string;
  colaborador_codigo: string;
  departamento: string | null;
}

/** Linha do relatório de vendas: aí o código vem, para conferência. */
export interface LinhaPedido {
  pedido: PedidoCompleto;
  colaborador_nome: string;
  colaborador_codigo: string;
  departamento: string | null;
}

export interface ProdutoCompleto {
  id: string;
  nome: string;
  codigo: string;
  categoria_id: string | null;
  custo: string;
  preco_venda: string;
  estoque: number;
  foto_url: string | null;
  ativo: boolean;
}

export type Vinculo = "clt" | "pj";

export interface ColaboradorCompleto {
  id: string;
  nome_completo: string;
  codigo: string;
  /** Código de parceiro do Sankhya. É por ele que a exportação identifica. */
  codparc: number;
  vinculo: Vinculo;
  /** Só CLT tem. PJ é identificado apenas pelo codparc. */
  matricula: number | null;
  empresa_id: string;
  papel: Papel;
  departamento_id: string | null;
  ativo: boolean;
  senha_provisoria: boolean;
  criado_em: string;
}

export interface EntradaColaborador {
  nome_completo: string;
  codigo: string;
  codparc: number;
  empresa_id: string;
  vinculo: Vinculo;
  matricula: number | null;
  papel: Papel;
  departamento_id: string | null;
}

export interface Empresa {
  id: string;
  codemp: number;
  nome: string;
  ativo: boolean;
}

export interface Departamento {
  id: string;
  nome: string;
}

export interface SolicitacaoSenha {
  id: string;
  codigo: string;
  nome_informado: string | null;
  criado_em: string;
}

/** A senha provisória aparece uma única vez, na resposta que a gerou. */
export interface SenhaRedefinida {
  codigo: string;
  senha_provisoria: string;
}

/** Resposta de POST /colaboradores: a senha provisória vem junto, uma vez só. */
export interface ColaboradorCriado {
  colaborador: ColaboradorCompleto;
  senha_provisoria: string;
}
