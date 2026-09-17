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
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (n.includes("energ")) return "energetico";
  if (n.includes("agua")) return "agua";
  if (n.includes("picol") || n.includes("sorvete")) return "picole";
  return "refrigerante";
}

export function IconeCategoria({ cat, size = 28 }: { cat: ChaveCategoria; size?: number }) {
  const fill = cat === "energetico" ? "currentColor" : "none";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {cat === "energetico" && <path d="M13 2 3 14h6l-1 8 10-12h-6l1-8z" />}
      {cat === "refrigerante" && (
        <>
          <path d="M8 3h8l-1 4H9L8 3z" fill="none" strokeWidth="1.8" />
          <path
            d="M9 7h6l-.7 12a1.5 1.5 0 0 1-1.5 1.4h-1.6A1.5 1.5 0 0 1 9.7 19L9 7z"
            fill="none"
            strokeWidth="1.8"
          />
          <circle cx="12" cy="11" r=".6" />
          <circle cx="13.4" cy="14" r=".6" />
        </>
      )}
      {cat === "agua" && (
        <path d="M12 2s7 8.5 7 13a7 7 0 0 1-14 0c0-4.5 7-13 7-13z" fill="none" strokeWidth="1.8" />
      )}
      {cat === "picole" && (
        <>
          <rect x="7" y="2" width="10" height="13" rx="5" fill="none" strokeWidth="1.8" />
          <line x1="12" y1="15" x2="12" y2="22" strokeWidth="1.8" />
        </>
      )}
    </svg>
  );
}
