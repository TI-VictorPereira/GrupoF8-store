import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Carregando } from "@/componentes/Carregando";
import { clienteConsulta } from "@/comum/clienteConsulta";
import { useSessao } from "@/comum/sessao";
import "@/estilos.css";
import { roteador } from "@/rotas/roteador";
import { Login } from "@/telas/Login";
import { TrocaSenhaObrigatoria } from "@/telas/TrocaSenhaObrigatoria";


function App() {
  const { eu, carregando } = useSessao();

  if (carregando) return <Carregando />;
  if (!eu) return <Login />;
  if (eu.senha_provisoria) return <TrocaSenhaObrigatoria />;
  return <RouterProvider router={roteador} context={{ eu }} />;
}

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <QueryClientProvider client={clienteConsulta}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
