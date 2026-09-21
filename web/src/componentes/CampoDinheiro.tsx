import type { ComponentProps } from "react";

import { Input } from "@/componentes/ui/input";

export function CampoDinheiro({
  valor,
  aoMudar,
  ...resto
}: {
  /** Sempre no formato da API: "8.55". */
  valor: string;
  aoMudar: (valor: string) => void;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange">) {
  const centavos = Math.round(Number(valor || 0) * 100);
  const texto = (centavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <Input
      {...resto}
      inputMode="numeric"
      value={texto}
      onChange={(evento) => {
        // 11 dígitos = até 999.999.999,99, que é o limite da coluna.
        const digitos = evento.target.value.replace(/\D/g, "").slice(0, 11);
        aoMudar((Number(digitos) / 100).toFixed(2));
      }}
    />
  );
}
