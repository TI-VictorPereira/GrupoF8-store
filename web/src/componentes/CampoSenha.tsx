import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState, type ComponentProps } from "react";

import { Input } from "@/componentes/ui/input";
import { cn } from "@/comum/utilitarios";

export const CampoSenha = forwardRef<HTMLInputElement, Omit<ComponentProps<typeof Input>, "type">>(
  function CampoSenha({ className, ...resto }, ref) {
    const [visivel, setVisivel] = useState(false);

    return (
      <div className="relative">
        <Input
          {...resto}
          ref={ref}
          type={visivel ? "text" : "password"}
          className={cn("pr-9", className)}
        />
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-suave hover:text-ink"
        >
          {visivel ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    );
  },
);
