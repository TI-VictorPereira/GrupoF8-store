import { createFileRoute } from "@tanstack/react-router";
import { Protegido } from "@/components/f8/Protegido";
import { ColaboradorHome } from "./index";

export const Route = createFileRoute("/colaborador")({
  head: () => ({
    meta: [
      { title: "Área do colaborador — Loja Interna F8" },
      {
        name: "description",
        content: "Libere o almoço do dia, compre na loja interna e acompanhe seu consumo.",
      },
      { property: "og:title", content: "Área do colaborador — Loja Interna F8" },
      {
        property: "og:description",
        content: "Libere o almoço do dia, compre na loja interna e acompanhe seu consumo.",
      },
    ],
  }),
  component: () => (
    <Protegido papeis={["colaborador", "admin", "refeitorio"]}>
      <ColaboradorHome />
    </Protegido>
  ),
});
