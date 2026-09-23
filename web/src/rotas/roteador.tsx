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
import { Fechamento } from "@/telas/Fechamento";
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

const TELA_DO_POSTO = "/refeitorio";

const raiz = createRootRouteWithContext<ContextoRota>()({
  beforeLoad: ({ context, location }) => {
    if (context.eu.papel === "refeitorio" && location.pathname !== TELA_DO_POSTO) {
      throw redirect({ to: TELA_DO_POSTO });
    }
  },
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
  beforeLoad: ({ context }) => {
    if (!["refeitorio", "admin"].includes(context.eu.papel)) throw redirect({ to: "/" });
  },
  component: function TelaRefeitorio() {
    const { eu } = raiz.useRouteContext();
    return <PainelRefeitorio eu={eu} />;
  },
});

const fechamento = createRoute({
  getParentRoute: () => raiz,
  path: "/fechamento",
  beforeLoad: ({ context }) => {
    if (!["dp", "admin"].includes(context.eu.papel)) throw redirect({ to: "/" });
  },
  component: Fechamento,
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
  fechamento,
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
export const roteador = createRouter({
  routeTree: arvore,
  context: { eu: undefined! },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof roteador;
  }
}
