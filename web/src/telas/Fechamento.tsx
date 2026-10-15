import { Cabecalho } from "@/componentes/Cabecalho";
import { DiaDeFechamento } from "@/componentes/DiaDeFechamento";
import { ExportacaoFolha } from "@/componentes/ExportacaoFolha";
import { Moldura } from "@/componentes/Moldura";
import { PAGINA_ADMIN } from "@/comum/layout";
import { cn } from "@/comum/utilitarios";
import { useSessao } from "@/hooks/sessao";

export function Fechamento() {
  const { eu } = useSessao();
  return (
    <Moldura>
      <Cabecalho titulo="Fechamento do ciclo" />
      <div className={cn(PAGINA_ADMIN, "py-6")}>
        {eu?.papel === "admin" && <DiaDeFechamento />}
        <ExportacaoFolha />
      </div>
    </Moldura>
  );
}
