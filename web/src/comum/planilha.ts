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


export function lerCsv(texto: string): Record<string, string>[] {
  const limpo = texto.replace(/^﻿/, "").trim();
  if (!limpo) return [];

  const linhas = limpo.split(/\r?\n/);
  const separador = (linhas[0]!.match(/;/g)?.length ?? 0) >= (linhas[0]!.match(/,/g)?.length ?? 0)
    ? ";"
    : ",";

  const partir = (linha: string): string[] => {
    const campos: string[] = [];
    let atual = "";
    let entreAspas = false;
    for (let i = 0; i < linha.length; i += 1) {
      const c = linha[i]!;
      if (c === '"') {
        // Aspas dobradas dentro de campo com aspas são uma aspa literal.
        if (entreAspas && linha[i + 1] === '"') {
          atual += '"';
          i += 1;
        } else entreAspas = !entreAspas;
      } else if (c === separador && !entreAspas) {
        campos.push(atual);
        atual = "";
      } else atual += c;
    }
    campos.push(atual);
    return campos.map((campo) => campo.trim());
  };

  const cabecalho = partir(linhas[0]!).map((coluna) => normalizar(coluna));
  return linhas.slice(1).flatMap((linha) => {
    if (!linha.trim()) return [];
    const valores = partir(linha);
    return [Object.fromEntries(cabecalho.map((coluna, i) => [coluna, valores[i] ?? ""]))];
  });
}

/** Sem acento, minúsculo: "Preço de Venda" e "preco de venda" viram a mesma coluna. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Primeiro nome de coluna que existir na linha, entre os aceitos. */
export function coluna(linha: Record<string, string>, ...nomes: string[]): string {
  for (const nome of nomes) {
    const valor = linha[normalizar(nome)];
    if (valor) return valor.trim();
  }
  return "";
}

export function numeroDaPlanilha(bruto: string): string | null {
  if (!bruto) return null;
  const limpo = bruto.replace(/[^\d,.-]/g, "").replace(",", ".");
  const numero = Number(limpo);
  return Number.isFinite(numero) ? String(numero) : null;
}

export function simOuNao(bruto: string): boolean | null {
  if (!bruto) return null;
  return ["sim", "s", "ativo", "true", "1"].includes(normalizar(bruto));
}
