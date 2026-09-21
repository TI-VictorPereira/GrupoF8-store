import { forwardRef, type ComponentProps } from "react";

import { Input } from "@/componentes/ui/input";

type Proprias = {
  valor: string;
  aoMudar: (valor: string) => void;
s  digitos?: number;
};
export const CampoInteiro = forwardRef<
  HTMLInputElement,
  Proprias & Omit<ComponentProps<typeof Input>, "value" | "onChange">
>(function CampoInteiro({ valor, aoMudar, digitos = 9, ...resto }, ref) {
  return (
    <Input
      {...resto}
      ref={ref}
      inputMode="numeric"
      value={valor}
      onChange={(evento) => aoMudar(evento.target.value.replace(/\D/g, "").slice(0, digitos))}
    />
  );
});
