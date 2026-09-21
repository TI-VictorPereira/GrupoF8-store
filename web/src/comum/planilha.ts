/**
 * Download de planilha em CSV.
 * Separador `;`
 */

function celula(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor);
  return /[";\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

export function baixarCsv(nomeArquivo: string, linhas: Record<string, unknown>[]): void {
  if (linhas.length === 0) return;

  const colunas = Object.keys(linhas[0]!);
  const conteudo = [
    colunas.join(";"),
    ...linhas.map((linha) => colunas.map((coluna) => celula(linha[coluna])).join(";")),
  ].join("\r\n");

  const hoje = new Date().toISOString().slice(0, 10);
  const blob = new Blob([`﻿${conteudo}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${nomeArquivo}-${hoje}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
