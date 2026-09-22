/**
 * Cor e rótulo por categoria de produto.
 *
 * A categoria é texto livre no banco, então o casamento é por palavra no
 * nome — foi assim no protótipo e continua sendo. Categoria nova que não
 * combine com nada cai em "refrigerante", que é o caso mais comum.
 *
 * O desenho do ícone fica em componentes/IconeCategoria.
 */

export type ChaveCategoria = "energetico" | "refrigerante" | "agua" | "picole";

export const ESTILO_CATEGORIA: Record<ChaveCategoria, { bg: string; fg: string; label: string }> = {
  energetico: { bg: "#FFF4CC", fg: "#8A6D00", label: "Energético" },
  refrigerante: { bg: "#FDE7E7", fg: "#C83A3A", label: "Refrigerante" },
  agua: { bg: "#E3F2FD", fg: "#2563EB", label: "Água" },
  picole: { bg: "#F3E8FF", fg: "#7C3AED", label: "Picolé" },
};

export function chaveCategoria(nome?: string | null): ChaveCategoria {
  const n = (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (n.includes("energ")) return "energetico";
  if (n.includes("agua")) return "agua";
  if (n.includes("picol") || n.includes("sorvete")) return "picole";
  return "refrigerante";
}
