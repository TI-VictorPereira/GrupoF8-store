import { Cabecalho } from "@/componentes/Cabecalho";
import { ExportacaoFolha } from "@/componentes/ExportacaoFolha";
import { Moldura } from "@/componentes/Moldura";
import { PAGINA_ADMIN } from "@/comum/layout";
import { cn } from "@/comum/utilitarios";



export function Fechamento() {
  return (
    <Moldura>
      <Cabecalho titulo="Fechamento do ciclo" />
      <div className={cn(PAGINA_ADMIN, "py-6")}>
        <ExportacaoFolha />
      </div>
    </Moldura>
  );
}
