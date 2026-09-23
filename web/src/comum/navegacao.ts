import type { LinkProps } from "@tanstack/react-router";

import type { Papel } from "@/interfaces/sessao";


export type ChaveContador = "almocos" | "pedidos";

export interface Destino {
 
  para: LinkProps["to"];
  rotulo: string;
  descricao: string;
 
  grupo: "balcao" | "gestao";
 
  area: "app" | "admin";
  contador?: ChaveContador;
  papeis: readonly Papel[];
}

export const DESTINOS: readonly Destino[] = [
  {
    para: "/refeitorio",
    rotulo: "Conferir almoços",
    descricao: "Ler o código de quem chega ao refeitório.",
    grupo: "balcao",
    area: "app",
    contador: "almocos",
    papeis: ["refeitorio", "admin"],
  },
  {
    para: "/admin/entregas",
    rotulo: "Entregar pedidos",
    descricao: "Retirada do que foi comprado na loja.",
    grupo: "balcao",
    area: "admin",
    contador: "pedidos",
    papeis: ["admin"],
  },
  {
    para: "/fechamento",
    rotulo: "Fechamento do ciclo",
    descricao: "Conferência por pessoa e arquivo para o Sankhya.",
    grupo: "gestao",
    area: "app",
    papeis: ["dp", "admin"],
  },
  {
    para: "/admin/almocos",
    rotulo: "Almoços",
    descricao: "Histórico e exportação por ciclo.",
    grupo: "gestao",
    area: "admin",
    papeis: ["admin"],
  },
  {
    para: "/admin/estoque",
    rotulo: "Estoque",
    descricao: "Produtos, preços e entrada de mercadoria.",
    grupo: "gestao",
    area: "admin",
    papeis: ["admin"],
  },
  {
    para: "/admin/vendas",
    rotulo: "Vendas",
    descricao: "Consumo do ciclo e exportação para o Sankhya.",
    grupo: "gestao",
    area: "admin",
    papeis: ["admin"],
  },
  {
    para: "/admin/colaboradores",
    rotulo: "Colaboradores",
    descricao: "Cadastro, senhas e importação.",
    grupo: "gestao",
    area: "admin",
    papeis: ["admin"],
  },
];

export function visiveis(papel: Papel, grupo?: Destino["grupo"]): Destino[] {
  return DESTINOS.filter(
    (destino) => destino.papeis.includes(papel) && (!grupo || destino.grupo === grupo),
  );
}

export const ABAS_ADMIN = DESTINOS.filter((destino) => destino.area === "admin");
