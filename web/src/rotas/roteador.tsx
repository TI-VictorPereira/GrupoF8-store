import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import type { Eu } from "@/interfaces/sessao";
import { Almoco } from "@/telas/Almoco";
import { Consumo } from "@/telas/Consumo";
import { Inicio } from "@/telas/Inicio";
import { Loja } from "@/telas/Loja";
import { PainelRefeitorio } from "@/telas/PainelRefeitorio";
import { PedidoConfirmado } from "@/telas/PedidoConfirmado";

/** O usuário já está resolvido antes de o roteador montar — ver main.tsx. */
export interface ContextoRota {
  eu: Eu;
}

const raiz = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <p className="p-6 text-sm text-suave">Página não encontrada.</p>
  ),
});

const inicio = createRoute({
  getParentRoute: () => raiz,
  path: "/",
  component: function TelaInicio() {
    const { eu } = raiz.useRouteContext() as ContextoRota;
    return <Inicio eu={eu} />;
  },
});

const loja = createRoute({ getParentRoute: () => raiz, path: "/loja", component: Loja });
const almoco = createRoute({ getParentRoute: () => raiz, path: "/almoco", component: Almoco });
const consumo = createRoute({ getParentRoute: () => raiz, path: "/consumo", component: Consumo });

const refeitorio = createRoute({
  getParentRoute: () => raiz,
  path: "/refeitorio",
  component: function TelaRefeitorio() {
    const { eu } = raiz.useRouteContext() as ContextoRota;
    // A API recusa quem não for refeitório ou admin; aqui é só para a pessoa
    // ver um aviso em vez de uma tela de erro.
    if (eu.papel === "colaborador")
      return <p className="p-6 text-sm text-suave">Esta tela é do refeitório.</p>;
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

const arvore = raiz.addChildren([inicio, loja, almoco, consumo, refeitorio, pedido]);

export function criarRoteador(eu: Eu) {
  return createRouter({ routeTree: arvore, context: { eu } satisfies ContextoRota });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof criarRoteador>;
  }
}
