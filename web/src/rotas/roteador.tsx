import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";

import type { Eu } from "@/interfaces/sessao";
import { Almoco } from "@/telas/Almoco";
import { Almocos as AdminAlmocos } from "@/telas/admin/Almocos";
import { Colaboradores } from "@/telas/admin/Colaboradores";
import { Entregas } from "@/telas/admin/Entregas";
import { Estoque } from "@/telas/admin/Estoque";
import { MolduraAdmin } from "@/telas/admin/MolduraAdmin";
import { Vendas } from "@/telas/admin/Vendas";
import { Consumo } from "@/telas/Consumo";
import { Inicio } from "@/telas/Inicio";
import { Loja } from "@/telas/Loja";
import { PainelRefeitorio } from "@/telas/PainelRefeitorio";

import { PedidoConfirmado } from "@/telas/PedidoConfirmado";

/**
 * As rotas só montam com a sessão já resolvida, por isso `eu` não é nulável e
 * nenhuma tela precisa tratar "ainda carregando" nem "deslogado" — quem
 * resolve esses dois estados é o App, antes. Ver main.tsx.
 */
export interface ContextoRota {
  eu: Eu;
}

const raiz = createRootRouteWithContext<ContextoRota>()({
  component: Outlet,
  notFoundComponent: () => (
    <p className="p-6 text-sm text-suave">Página não encontrada.</p>
  ),
});

const inicio = createRoute({
  getParentRoute: () => raiz,
  path: "/",
  component: function TelaInicio() {
    const { eu } = raiz.useRouteContext();
    return <Inicio eu={eu} />;
  },
});

const loja = createRoute({ getParentRoute: () => raiz, path: "/loja", component: Loja });
const almoco = createRoute({ getParentRoute: () => raiz, path: "/almoco", component: Almoco });
const consumo = createRoute({ getParentRoute: () => raiz, path: "/consumo", component: Consumo });

const refeitorio = createRoute({
  getParentRoute: () => raiz,
  path: "/refeitorio",
  // Barreira antes de montar, não dentro do componente: quem não é do
  // refeitório nunca chega a disparar as consultas do painel, que a API
  // recusaria com 403. Quem garante o acesso continua sendo o servidor.
  beforeLoad: ({ context }) => {
    if (context.eu.papel === "colaborador") throw redirect({ to: "/" });
  },
  component: function TelaRefeitorio() {
    const { eu } = raiz.useRouteContext();
    return <PainelRefeitorio eu={eu} />;
  },
});

const pedido = createRoute({
  getParentRoute: () => raiz,
  path: "/pedido/$pedidoId",
  component: function TelaPedido() {
    const { pedidoId } = pedido.useParams();
    return <PedidoConfirmado pedidoId={pedidoId} />;
  },
});

// --- administração ---------------------------------------------------------
// Rota de layout: a barreira e a navegação ficam no pai, as abas são filhas.

const admin = createRoute({
  getParentRoute: () => raiz,
  path: "/admin",
  beforeLoad: ({ context }) => {
    if (context.eu.papel !== "admin") throw redirect({ to: "/" });
  },
  component: function TelaAdmin() {
    const { eu } = raiz.useRouteContext();
    return <MolduraAdmin eu={eu} />;
  },
});

const adminInicio = createRoute({
  getParentRoute: () => admin,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/admin/entregas" });
  },
});

const adminEntregas = createRoute({
  getParentRoute: () => admin,
  path: "/entregas",
  component: Entregas,
});

const adminAlmocos = createRoute({
  getParentRoute: () => admin,
  path: "/almocos",
  component: AdminAlmocos,
});

const adminEstoque = createRoute({
  getParentRoute: () => admin,
  path: "/estoque",
  component: Estoque,
});

const adminVendas = createRoute({
  getParentRoute: () => admin,
  path: "/vendas",
  component: Vendas,
});

const adminColaboradores = createRoute({
  getParentRoute: () => admin,
  path: "/colaboradores",
  component: Colaboradores,
});

const arvore = raiz.addChildren([
  inicio,
  loja,
  almoco,
  consumo,
  refeitorio,
  pedido,
  admin.addChildren([
    adminInicio,
    adminEntregas,
    adminAlmocos,
    adminEstoque,
    adminVendas,
    adminColaboradores,
  ]),
]);

/**
 * Instância única.
 *
 * Recriar o roteador quando o usuário muda zera os caches dele e remonta a
 * árvore inteira — a documentação do TanStack Router trata isso como erro. O
 * `eu` entra vivo pelo prop `context` do RouterProvider, não pelo construtor.
 */
export const roteador = createRouter({
  routeTree: arvore,
  context: { eu: undefined! },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof roteador;
  }
}
