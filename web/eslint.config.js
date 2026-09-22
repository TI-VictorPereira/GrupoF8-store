// @ts-check

/**
 * Lint do front.
 *
 * O `tsc` já garante os tipos; o ESLint entra no que ele não vê — dependência
 * faltando num efeito, chave de consulta montada errado, link apontando para
 * rota que não existe.
 *
 * Os dois plugins do TanStack são o principal ganho aqui: quase todo estado
 * desta interface passa por Query e Router, e os erros deles são silenciosos
 * (a tela não quebra, só mostra dado velho ou não recarrega).
 */

import js from "@eslint/js";
import consultaF8 from "@tanstack/eslint-plugin-query";
import roteadorF8 from "@tanstack/eslint-plugin-router";
import ganchosReact from "eslint-plugin-react-hooks";
import atualizacaoReact from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist", "node_modules", "src/api/tipos.gen.ts"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      atualizacaoReact.configs.vite,
      consultaF8.configs["flat/recommended"],
      roteadorF8.configs["flat/recommended"],
    ],
    // O react-hooks ainda publica os presets no formato antigo do eslintrc,
    // que o flat config recusa. Declarar as duas regras na mão evita depender
    // de qual chave (`recommended`, `recommended-latest`, `flat`) é a nova em
    // cada versão — e são exatamente estas duas que importam.
    plugins: { "react-hooks": ganchosReact },
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        // O front roda só no navegador; sem isto o ESLint acha que `document`,
        // `fetch` e `setTimeout` são variáveis não declaradas.
        document: "readonly",
        window: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        console: "readonly",
        Blob: "readonly",
        URL: "readonly",
        File: "readonly",
        HTMLInputElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLDivElement: "readonly",
        SVGSVGElement: "readonly",
        RequestInit: "readonly",
        Response: "readonly",
      },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      // Aviso e não erro: a lista de dependências às vezes é omitida de
      // propósito, e transformar isso em erro ensina a silenciar a regra.
      "react-hooks/exhaustive-deps": "warn",
      // Parâmetro que começa com _ é intencionalmente ignorado.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // A regra do react-refresh cobra que um arquivo exporte só componentes,
    // para o hot reload não perder estado. Nestes dois casos ela não se
    // aplica: os componentes do shadcn vêm de fora exportando variantes junto
    // (mudar isso significa divergir do upstream em toda atualização), e o
    // main.tsx é o ponto de entrada, que por definição não exporta nada.
    files: ["src/componentes/ui/**", "src/main.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
]);
