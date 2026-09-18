import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { useSessao } from "@/comum/sessao";
import "@/estilos.css";
import { Inicio } from "@/telas/Inicio";
import { Login } from "@/telas/Login";
import { TrocaSenhaObrigatoria } from "@/telas/TrocaSenhaObrigatoria";

const clienteConsulta = new QueryClient({
  defaultOptions: {
    queries: {
      // 401 e 403 não melhoram com repetição; repetir só atrasa a tela.
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  const { eu, carregando } = useSessao();

  if (carregando) {
    return <p className="p-6 text-sm text-suave">Carregando…</p>;
  }
  if (!eu) {
    return <Login />;
  }
  // Barreira do primeiro acesso: nenhuma tela abre antes da troca.
  if (eu.senha_provisoria) {
    return <TrocaSenhaObrigatoria />;
  }
  return <Inicio eu={eu} />;
}

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <QueryClientProvider client={clienteConsulta}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
