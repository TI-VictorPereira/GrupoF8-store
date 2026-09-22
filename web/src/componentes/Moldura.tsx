import type { ReactNode } from "react";

/**
 * Página das telas do colaborador.
 *
 * Não desenha caixa nenhuma, de propósito. Antes a tela inteira vivia dentro
 * de uma moldura de largura fixa — herança do protótipo, que foi desenhado
 * como se fosse um celular — e era por isso que no monitor o cabeçalho escuro
 * parava no meio da tela em vez de atravessar a página.
 *
 * Agora cada tela sangra o próprio cabeçalho de ponta a ponta e centraliza o
 * conteúdo com `PAGINA_APP`, que é como a administração já funcionava.
 */
export function Moldura({ children }: { children: ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
