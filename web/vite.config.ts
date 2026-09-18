import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  server: {
    host: "0.0.0.0",
    port: 5175,
    // O watcher do Linux não recebe os eventos de arquivo vindos do volume do
    // Windows; sem polling o hot reload simplesmente não dispara.
    watch: { usePolling: true, interval: 300 },
    proxy: {
      // Tudo passa por /api, na mesma origem — igual ao que o Caddy faz em
      // produção. É isso que faz o cookie de sessão se comportar aqui
      // exatamente como vai se comportar no ar.
      "/api": {
        target: "http://api:8000",
        changeOrigin: true,
        // Em desenvolvimento a API não declara o prefixo (ele quebraria a
        // página /docs), então o proxy o remove. Em produção o prefixo é
        // preservado e o FastAPI o reconhece via root_path.
        rewrite: (caminho) => caminho.replace(/^\/api/, ""),
      },
    },
  },
});
