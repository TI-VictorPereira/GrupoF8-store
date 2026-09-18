import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";

import { Carregando } from "@/componentes/Carregando";
import { useSessao } from "@/comum/sessao";
import "@/estilos.css";
import { criarRoteador } from "@/rotas/roteador";
import { Login } from "@/telas/Login";
import { TrocaSenhaObrigatoria } from "@/telas/TrocaSenhaObrigatoria";

const clienteConsulta = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

function App() {
  const { eu, carregando } = useSessao();

  // O roteador só existe depois de saber quem está logado; assim nenhuma rota
  // precisa lidar com o caso "ainda não sei se há sessão".
  const roteador = useMemo(() => (eu ? criarRoteador(eu) : null), [eu]);

  if (carregando) return <Carregando />;
  if (!eu) return <Login />;
  if (eu.senha_provisoria) return <TrocaSenhaObrigatoria />;
  return <RouterProvider router={roteador!} />;
}

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <QueryClientProvider client={clienteConsulta}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
