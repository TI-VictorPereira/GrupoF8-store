import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";

/**
 * CODE128 do código do almoço.
 *
 * O código é numérico de 14 dígitos, então o CODE128 usa a variante C, que
 * compacta dois dígitos por símbolo — a barra sai estreita o suficiente para
 * caber na tela do celular e ser lida pelo leitor de mão do refeitório.
 */
export function CodigoBarras({ valor }: { valor: string }) {
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svg.current) return;
    JsBarcode(svg.current, valor, {
      format: "CODE128",
      width: 2,
      height: 72,
      displayValue: true,
      fontSize: 13,
      margin: 0,
      lineColor: "#161616",
    });
  }, [valor]);

  return (
    <div className="flex justify-center overflow-hidden rounded-xl border border-borda bg-white p-3">
      <svg ref={svg} />
    </div>
  );
}
