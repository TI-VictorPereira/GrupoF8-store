import { CircleHelp } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/comum/utilitarios";

export function Help({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!aberto) return;

    function aoClicarFora(evento: MouseEvent) {
      if (raiz.current && !raiz.current.contains(evento.target as Node)) setAberto(false);
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false);
    }

    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  return (
    <span ref={raiz} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label="O que é isso?"
        aria-expanded={aberto}
        className="text-muito-suave hover:text-suave inline-flex size-4 items-center justify-center rounded-full"
      >
        <CircleHelp className="size-4" />
      </button>

      {aberto && (
        <div
          role="tooltip"
          className={cn(
            "absolute top-full left-1/2 z-50 mt-1.5 w-56 -translate-x-1/2 rounded-lg border",
            "border-borda bg-card p-2.5 text-[11px] leading-snug text-suave shadow-lg",
          )}
        >
          {children}
        </div>
      )}
    </span>
  );
}
