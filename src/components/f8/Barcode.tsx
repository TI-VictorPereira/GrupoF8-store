import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export function Barcode({ valor }: { valor: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current) {
      JsBarcode(svgRef.current, valor, {
        format: "CODE128",
        width: 2.2,
        height: 60,
        displayValue: true,
        fontSize: 14,
        margin: 0,
        lineColor: "#0B0B0B",
      });
    }
  }, [valor]);

  return (
    <div className="bg-card border border-border rounded-xl p-3 flex justify-center overflow-hidden">
      <svg ref={svgRef} />
    </div>
  );
}
