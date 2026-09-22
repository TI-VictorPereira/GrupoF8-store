/**
 * Largura e grade das páginas.
 *
 * Nada disso vem pronto. O React desenha DOM e não tem opinião sobre layout;
 * o Tailwind é um vocabulário de classes, não alguém que decide como a página
 * fica em 1900px. Nenhuma biblioteca de CSS decide isso — Bootstrap, MUI e
 * Chakra também exigem que você declare os pontos de quebra. O que é nosso é
 * a decisão; o que dá para delegar está delegado logo abaixo.
 */

/** Faixa central das telas do colaborador, com a margem lateral embutida. */
export const PAGINA_APP = "mx-auto w-full max-w-5xl px-5";

/** Balcão do refeitório: fila de nomes. */
export const PAGINA_PAINEL = "mx-auto w-full max-w-3xl px-5";

/** Administração: tabelas com muitas colunas. */
export const PAGINA_ADMIN = "mx-auto w-full max-w-6xl px-5";

/**
 * Grade de cartões que se ajusta sozinha.
 *
 * Aqui não existe nenhum `md:`. `auto-fit` com `minmax` entrega a conta ao
 * navegador: ele encaixa quantas colunas couberem com pelo menos 17rem cada e
 * divide a sobra por igual. Uma coluna no celular, três ou quatro no desktop,
 * e o certo também nas larguras que ninguém testou — tablet deitado, janela
 * arrastada pela metade, monitor em pé.
 */
export const GRADE_CARTOES = "grid gap-4 grid-cols-[repeat(auto-fit,minmax(17rem,1fr))]";

/**
 * Grade da vitrine.
 *
 * `auto-fill` em vez de `auto-fit`: com poucos produtos na loja, `auto-fit`
 * esticaria três garrafas de água até a largura do monitor. `auto-fill` mantém
 * o tamanho do cartão e deixa o resto da linha vazio, que é como uma prateleira
 * se parece.
 */
export const GRADE_PRODUTOS = "grid gap-3 grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]";
