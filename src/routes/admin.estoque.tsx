import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/f8/Toast";
import { fmt } from "@/lib/f8/format";
import type { CategoriaProduto, Produto } from "@/lib/f8/types";
import { exportarPlanilha } from "@/lib/f8/exportar";

async function lerFotoRedimensionada(arquivo: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error("falha ao ler"));
    leitor.readAsDataURL(arquivo);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("falha ao abrir"));
    el.src = dataUrl;
  });
  const lado = 320;
  const escala = Math.min(1, lado / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export const Route = createFileRoute("/admin/estoque")({
  component: Estoque,
});

const ESTOQUE_BAIXO = 5;

type FormProduto = {
  nome: string;
  codigo: string;
  categoria_id: string;
  custo: string;
  preco_venda: string;
  estoque: string;
  foto_url: string;
};

const FORM_VAZIO: FormProduto = {
  nome: "",
  codigo: "",
  categoria_id: "",
  custo: "",
  preco_venda: "",
  estoque: "0",
  foto_url: "",
};

function Estoque() {
  const { mostrar } = useToast();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<CategoriaProduto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [importando, setImportando] = useState(false);

  const [busca, setBusca] = useState("");
  const [filtroCat, setFiltroCat] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const [ajuste, setAjuste] = useState<{ produto: Produto; tipo: string } | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");

  const [editando, setEditando] = useState<Produto | null>(null);
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<FormProduto>(FORM_VAZIO);

  const carregar = useCallback(async () => {
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase.from("produtos").select("*").order("nome"),
      supabase.from("categorias_produto").select("*").order("nome"),
    ]);
    setProdutos((prods ?? []) as Produto[]);
    setCategorias((cats ?? []) as CategoriaProduto[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const nomeCategoria = useMemo(() => {
    const mapa = new Map(categorias.map((c) => [c.id, c.nome]));
    return (id: string | null) => (id ? (mapa.get(id) ?? "—") : "—");
  }, [categorias]);

  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setAberto(true);
  }

  function abrirEdicao(p: Produto) {
    setEditando(p);
    setForm({
      nome: p.nome,
      codigo: p.codigo,
      categoria_id: p.categoria_id ?? "",
      custo: String(p.custo),
      preco_venda: String(p.preco_venda),
      estoque: String(p.estoque),
      foto_url: p.foto_url ?? "",
    });
    setAberto(true);
  }

  async function salvarProduto() {
    if (!form.nome || !form.codigo || !form.preco_venda) {
      mostrar("Preencha nome, código e valor de venda.", "danger");
      return;
    }
    const dados = {
      nome: form.nome,
      codigo: form.codigo,
      categoria_id: form.categoria_id || null,
      custo: Number(form.custo || 0),
      preco_venda: Number(form.preco_venda),
      estoque: Number(form.estoque || 0),
      foto_url: form.foto_url || null,
    };
    const { error } = editando
      ? await supabase.from("produtos").update(dados).eq("id", editando.id)
      : await supabase.from("produtos").insert(dados);
    if (error) {
      mostrar(error.message, "danger");
      return;
    }
    mostrar(editando ? "Produto atualizado." : "Produto cadastrado.");
    setAberto(false);
    carregar();
  }

  async function salvarAjuste() {
    if (!ajuste) return;
    const qtd = Number(quantidade);
    if (!qtd || qtd <= 0) {
      mostrar("Informe uma quantidade válida.", "danger");
      return;
    }
    const { error } = await supabase.rpc("ajustar_estoque", {
      p_produto_id: ajuste.produto.id,
      p_quantidade: qtd,
      p_tipo: ajuste.tipo,
      p_motivo: motivo || "Ajuste manual",
    });
    if (error) {
      mostrar(error.message, "danger");
      return;
    }
    mostrar("Estoque atualizado.");
    setAjuste(null);
    setQuantidade("");
    setMotivo("");
    carregar();
  }

  async function alternarAtivo(p: Produto) {
    const { error } = await supabase.from("produtos").update({ ativo: !p.ativo }).eq("id", p.id);
    if (error) mostrar(error.message, "danger");
    else carregar();
  }

  const visiveis = produtos.filter((p) => {
    const termo = busca.trim().toLowerCase();
    const combinaBusca =
      !termo || p.nome.toLowerCase().includes(termo) || p.codigo.toLowerCase().includes(termo);
    const combinaCat = !filtroCat || p.categoria_id === filtroCat;
    const combinaStatus = !filtroStatus || (filtroStatus === "ativos" ? p.ativo : !p.ativo);
    return combinaBusca && combinaCat && combinaStatus;
  });

  async function exportar() {
    const linhas = visiveis.map((p) => ({
      Produto: p.nome,
      "Código do produto": p.codigo,
      Categoria: nomeCategoria(p.categoria_id),
      "Custo unitário": Number(p.custo),
      "Preço de venda": Number(p.preco_venda),
      Margem: Number(p.preco_venda) - Number(p.custo),
      "Estoque atual": p.estoque,
      Situação: p.ativo ? "Ativo" : "Inativo",
    }));

    let consultaAjustes = supabase
      .from("ajustes_estoque")
      .select("*, produtos(nome, codigo), profiles!ajustes_estoque_criado_por_fkey(nome_completo, codigo)")
      .order("criado_em", { ascending: false })
      .limit(500);
    if (de) consultaAjustes = consultaAjustes.gte("criado_em", new Date(`${de}T00:00:00`).toISOString());
    if (ate) consultaAjustes = consultaAjustes.lte("criado_em", new Date(`${ate}T23:59:59`).toISOString());
    const { data: ajustes } = await consultaAjustes;

    const linhasAjustes = ((ajustes ?? []) as unknown as Array<{
      criado_em: string;
      tipo: string;
      quantidade: number;
      motivo: string;
      produtos?: { nome: string; codigo: string } | null;
      profiles?: { nome_completo: string; codigo: string } | null;
    }>).map((a) => ({
      Data: new Date(a.criado_em).toLocaleString("pt-BR"),
      Produto: a.produtos?.nome ?? "—",
      "Código do produto": a.produtos?.codigo ?? "—",
      Tipo: a.tipo,
      Quantidade: a.quantidade,
      Motivo: a.motivo,
      Responsável: a.profiles?.nome_completo ?? "—",
      "Código do responsável": a.profiles?.codigo ?? "—",
    }));

    await exportarPlanilha("estoque-f8", [
      { nome: "Produtos", linhas },
      { nome: "Ajustes", linhas: linhasAjustes },
    ]);
  }

  async function baixarModelo() {
    const linhas = (visiveis.length ? visiveis : produtos).map((p) => ({
      Codigo: p.codigo,
      Nome: p.nome,
      Categoria: nomeCategoria(p.categoria_id),
      Custo: Number(p.custo),
      "Preco de venda": Number(p.preco_venda),
      Estoque: p.estoque,
      Ativo: p.ativo ? "Sim" : "Nao",
    }));
    await exportarPlanilha("modelo-produtos-f8", [
      {
        nome: "Produtos",
        linhas: linhas.length
          ? linhas
          : [
              {
                Codigo: "REF001",
                Nome: "Exemplo de produto",
                Categoria: "Refrigerante",
                Custo: 2,
                "Preco de venda": 5,
                Estoque: 10,
                Ativo: "Sim",
              },
            ],
      },
    ]);
  }

  async function importarPlanilha(arquivo: File) {
    setImportando(true);
    try {
      const XLSX = await import("xlsx");
      const pasta = XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
      const primeira = pasta.SheetNames[0];
      if (!primeira) throw new Error("Planilha vazia");
      const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(pasta.Sheets[primeira]!);

      const pegar = (linha: Record<string, unknown>, chaves: string[]) => {
        for (const [k, v] of Object.entries(linha)) {
          const normal = k
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .toLowerCase();
          if (chaves.includes(normal)) return v;
        }
        return undefined;
      };

      const mapaCat = new Map(
        categorias.map((c) => [c.nome.trim().toLowerCase(), c.id] as const),
      );
      const mapaProd = new Map(produtos.map((p) => [p.codigo.trim().toLowerCase(), p] as const));

      let atualizados = 0;
      let criados = 0;
      const erros: string[] = [];

      for (const linha of linhas.slice(0, 500)) {
        const codigo = String(pegar(linha, ["codigo", "codigo do produto"]) ?? "").trim();
        if (!codigo) continue;
        const nome = String(pegar(linha, ["nome", "produto"]) ?? "").trim();
        const catNome = String(pegar(linha, ["categoria"]) ?? "").trim().toLowerCase();
        const custoBruto = pegar(linha, ["custo", "custo unitario", "valor de custo"]);
        const vendaBruto = pegar(linha, [
          "preco de venda",
          "preco",
          "venda",
          "valor de venda",
        ]);
        const estoqueBruto = pegar(linha, ["estoque", "estoque atual", "quantidade"]);
        const ativoBruto = String(pegar(linha, ["ativo", "situacao"]) ?? "").trim().toLowerCase();

        const numero = (v: unknown) => {
          if (v === undefined || v === null || v === "") return undefined;
          const n = Number(String(v).replace(/[^\d,.-]/g, "").replace(",", "."));
          return Number.isFinite(n) ? n : undefined;
        };

        const existente = mapaProd.get(codigo.toLowerCase());
        const categoria_id = catNome ? (mapaCat.get(catNome) ?? null) : undefined;

        if (existente) {
          const dados: {
            nome?: string;
            categoria_id?: string | null;
            custo?: number;
            preco_venda?: number;
            estoque?: number;
            ativo?: boolean;
          } = {};
          if (nome) dados.nome = nome;
          if (categoria_id !== undefined) dados.categoria_id = categoria_id;
          const custoNum = numero(custoBruto);
          const vendaNum = numero(vendaBruto);
          const estoqueNum = numero(estoqueBruto);
          if (custoNum !== undefined) dados.custo = custoNum;
          if (vendaNum !== undefined) dados.preco_venda = vendaNum;
          if (estoqueNum !== undefined) dados.estoque = estoqueNum;

          if (ativoBruto) dados.ativo = ["sim", "s", "ativo", "true", "1"].includes(ativoBruto);
          if (Object.keys(dados).length === 0) continue;
          const { error } = await supabase.from("produtos").update(dados).eq("id", existente.id);
          if (error) erros.push(`${codigo}: ${error.message}`);
          else atualizados++;
        } else {
          if (!nome || numero(vendaBruto) === undefined) {
            erros.push(`${codigo}: informe nome e preço de venda para cadastrar`);
            continue;
          }
          const { error } = await supabase.from("produtos").insert({
            codigo,
            nome,
            categoria_id: categoria_id ?? null,
            custo: numero(custoBruto) ?? 0,
            preco_venda: numero(vendaBruto)!,
            estoque: numero(estoqueBruto) ?? 0,
            ativo: ativoBruto ? ["sim", "s", "ativo", "true", "1"].includes(ativoBruto) : true,
          });
          if (error) erros.push(`${codigo}: ${error.message}`);
          else criados++;
        }
      }

      mostrar(
        `${atualizados} atualizado(s), ${criados} cadastrado(s)` +
          (erros.length ? ` · ${erros.length} com erro` : ""),
        erros.length ? "danger" : "ok",
      );

      await carregar();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Não foi possível ler a planilha.", "danger");
    } finally {
      setImportando(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou código"
          className="border border-border rounded-lg px-3 py-2 text-sm w-full sm:w-64 bg-card"
        />
        <select
          value={filtroCat}
          onChange={(e) => setFiltroCat(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card w-[calc(50%-0.25rem)] sm:w-auto"
        >
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card w-[calc(50%-0.25rem)] sm:w-auto"
        >
          <option value="">Ativos e inativos</option>
          <option value="ativos">Somente ativos</option>
          <option value="inativos">Somente inativos</option>
        </select>
        <input
          type="date"
          aria-label="Ajustes a partir de"
          value={de}
          onChange={(e) => setDe(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card w-[calc(50%-0.25rem)] sm:w-auto"
        />
        <input
          type="date"
          aria-label="Ajustes até"
          value={ate}
          onChange={(e) => setAte(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card w-[calc(50%-0.25rem)] sm:w-auto"
        />

        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <button
            onClick={baixarModelo}
            className="flex-1 sm:flex-none text-xs font-semibold text-ink border border-border rounded-lg px-3 py-2.5 bg-card"
          >
            Baixar modelo
          </button>
          <label
            className={
              "flex-1 sm:flex-none text-center cursor-pointer text-xs font-semibold text-ink border border-border rounded-lg px-3 py-2.5 bg-card " +
              (importando ? "opacity-60 pointer-events-none" : "")
            }
          >
            {importando ? "Importando…" : "Importar planilha"}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                e.target.value = "";
                if (arquivo) importarPlanilha(arquivo);
              }}
            />
          </label>
          <button
            onClick={exportar}
            className="flex-1 sm:flex-none text-xs font-semibold text-ink border border-border rounded-lg px-3 py-2.5 bg-card"
          >
            Exportar estoque (Excel)
          </button>
          <button
            onClick={abrirNovo}
            className="flex-1 sm:flex-none bg-accent text-ink text-sm font-bold rounded-lg px-4 py-2.5"
          >
            Novo produto
          </button>
        </div>
      </div>


      {/* Lista em cartões — celular */}
      <div className="md:hidden flex flex-col gap-3">
        {carregando ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : visiveis.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum produto encontrado.
          </p>
        ) : (
          visiveis.map((p) => (
            <div key={p.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start gap-3">
                {p.foto_url ? (
                  <img src={p.foto_url} alt={p.nome} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-bg border border-border shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={"font-semibold text-sm truncate " + (p.ativo ? "" : "line-through text-muted-foreground")}>
                    {p.nome}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {nomeCategoria(p.categoria_id)} · {p.codigo}
                  </p>
                  <p className="text-xs mt-1.5">
                    <span className="font-semibold">{fmt(Number(p.preco_venda))}</span>
                    <span className="text-muted-foreground"> · custo {fmt(Number(p.custo))}</span>
                  </p>
                </div>
                <span
                  className={
                    "text-xs font-bold rounded-full px-2 py-1 shrink-0 " +
                    (p.estoque <= ESTOQUE_BAIXO
                      ? "text-danger bg-danger/10"
                      : "text-success bg-success/10")
                  }
                >
                  {p.estoque} un
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setAjuste({ produto: p, tipo: "entrada" })}
                  className="flex-1 text-xs font-semibold text-ink border border-border rounded-lg px-2.5 py-2"
                >
                  Ajustar
                </button>
                <button
                  onClick={() => abrirEdicao(p)}
                  className="flex-1 text-xs font-semibold text-ink border border-border rounded-lg px-2.5 py-2"
                >
                  Editar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Tabela — desktop */}
      <div className="hidden md:block bg-card border border-border rounded-xl p-4 overflow-x-auto">
        <table className="w-full text-sm admin-table">
          <thead>
            <tr className="text-left border-b border-border">
              <th className="py-2 pr-3">Foto</th>
              <th className="py-2 pr-3">Produto</th>
              <th className="py-2 pr-3">Código</th>
              <th className="py-2 pr-3">Custo</th>
              <th className="py-2 pr-3">Venda</th>
              <th className="py-2 pr-3">Margem</th>
              <th className="py-2 pr-3">Estoque</th>
              <th className="py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            ) : visiveis.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted-foreground">
                  Nenhum produto encontrado.
                </td>
              </tr>
            ) : (
              visiveis.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="py-3 pr-3">
                    {p.foto_url ? (
                      <img src={p.foto_url} alt={p.nome} className="w-9 h-9 rounded-lg object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-bg border border-border" />
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    <p className={"font-semibold " + (p.ativo ? "" : "line-through text-muted-foreground")}>
                      {p.nome}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {nomeCategoria(p.categoria_id)}
                    </p>
                  </td>
                  <td className="py-3 pr-3 font-mono text-xs">{p.codigo}</td>
                  <td className="py-3 pr-3">{fmt(Number(p.custo))}</td>
                  <td className="py-3 pr-3">{fmt(Number(p.preco_venda))}</td>
                  <td className="py-3 pr-3 text-success font-semibold">
                    {fmt(Number(p.preco_venda) - Number(p.custo))}
                  </td>
                  <td className={"py-3 pr-3 " + (p.estoque <= ESTOQUE_BAIXO ? "low-stock" : "font-semibold")}>
                    {p.estoque}
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => setAjuste({ produto: p, tipo: "entrada" })}
                      className="text-xs font-semibold text-ink border border-border rounded-lg px-2.5 py-1.5 mr-1.5"
                    >
                      Ajustar
                    </button>
                    <button
                      onClick={() => abrirEdicao(p)}
                      className="text-xs font-semibold text-ink border border-border rounded-lg px-2.5 py-1.5"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {aberto && (
        <div
          className="fixed inset-0 bg-ink/50 z-40 flex items-center justify-center p-4"
          onClick={() => setAberto(false)}
        >
          <div
            className="bg-card rounded-2xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg mb-4">
              {editando ? "Editar produto" : "Novo produto"}
            </h3>
            <label className="text-xs font-semibold text-muted-foreground">Foto do produto</label>
            <div className="flex items-center gap-3 mt-1 mb-3">
              <div className="w-16 h-16 rounded-lg border border-border overflow-hidden flex items-center justify-center bg-bg text-[10px] text-center text-muted-foreground">
                {form.foto_url ? (
                  <img src={form.foto_url} alt="Foto do produto" className="w-full h-full object-cover" />
                ) : (
                  "Sem foto"
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const arquivo = e.target.files?.[0];
                  e.target.value = "";
                  if (!arquivo) return;
                  try {
                    setForm((f) => ({ ...f, foto_url: "" }));
                    const foto = await lerFotoRedimensionada(arquivo);
                    setForm((f) => ({ ...f, foto_url: foto }));
                  } catch {
                    mostrar("Não foi possível carregar a imagem.", "danger");
                  }
                }}
                className="text-xs"
              />
              {form.foto_url && (
                <button
                  onClick={() => setForm({ ...form, foto_url: "" })}
                  className="text-xs font-semibold text-danger"
                >
                  Remover
                </button>
              )}
            </div>
            <label className="text-xs font-semibold text-muted-foreground">Nome do produto</label>
            <input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm mt-1 mb-3"
            />
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Código</label>
                <input
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Categoria</label>
                <select
                  value={form.categoria_id}
                  onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm mt-1 bg-card"
                >
                  <option value="">Sem categoria</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Valor de custo</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.custo}
                  onChange={(e) => setForm({ ...form, custo: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Valor de venda</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.preco_venda}
                  onChange={(e) => setForm({ ...form, preco_venda: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Estoque</label>
                <input
                  type="number"
                  value={form.estoque}
                  onChange={(e) => setForm({ ...form, estoque: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm mt-1"
                />
              </div>
            </div>
            <div className="flex gap-2">
              {editando && (
                <button
                  onClick={() => {
                    alternarAtivo(editando);
                    setAberto(false);
                  }}
                  className="text-xs font-semibold text-danger border border-danger/30 rounded-lg px-3 py-2.5 mr-auto"
                >
                  {editando.ativo ? "Desativar" : "Ativar"}
                </button>
              )}
              <button
                onClick={() => setAberto(false)}
                className="text-sm font-semibold border border-border rounded-lg px-4 py-2.5"
              >
                Cancelar
              </button>
              <button
                onClick={salvarProduto}
                className="text-sm font-bold bg-accent text-ink rounded-lg px-4 py-2.5"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {ajuste && (
        <div
          className="fixed inset-0 bg-ink/50 z-40 flex items-center justify-center p-4"
          onClick={() => setAjuste(null)}
        >
          <div
            className="bg-card rounded-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-bold text-sm mb-4">Ajustar estoque — {ajuste.produto.nome}</p>
            <select
              value={ajuste.tipo}
              onChange={(e) => setAjuste({ ...ajuste, tipo: e.target.value })}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm mb-2 bg-card"
            >
              <option value="entrada">Entrada</option>
              <option value="baixa">Baixa / perda</option>
            </select>
            <input
              placeholder="Quantidade"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm mb-2"
            />
            <input
              placeholder="Motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setAjuste(null)}
                className="text-sm font-semibold border border-border rounded-lg px-4 py-2.5"
              >
                Cancelar
              </button>
              <button
                onClick={salvarAjuste}
                className="text-sm font-bold bg-accent text-ink rounded-lg px-4 py-2.5"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
