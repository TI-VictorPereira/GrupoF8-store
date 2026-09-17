export async function exportarPlanilha(
  nomeArquivo: string,
  abas: { nome: string; linhas: Record<string, unknown>[] }[],
) {
  const XLSX = await import("xlsx");
  const pasta = XLSX.utils.book_new();
  for (const aba of abas) {
    const linhas = aba.linhas.length ? aba.linhas : [{ Aviso: "Nenhum dado neste recorte" }];
    XLSX.utils.book_append_sheet(pasta, XLSX.utils.json_to_sheet(linhas), aba.nome.slice(0, 31));
  }
  const data = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(pasta, `${nomeArquivo}-${data}.xlsx`);
}
