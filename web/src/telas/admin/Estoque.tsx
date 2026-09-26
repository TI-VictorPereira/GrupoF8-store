import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { CampoDinheiro } from "@/componentes/CampoDinheiro";
import { CampoInteiro } from "@/componentes/CampoInteiro";
import { ImportarPlanilha } from "@/componentes/ImportarPlanilha";
import { Carregando } from "@/componentes/Carregando";
import { Vazio } from "@/componentes/Vazio";
import { Badge } from "@/componentes/ui/badge";
import { Button } from "@/componentes/ui/button";
import { Card } from "@/componentes/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/componentes/ui/dialog";
import { Input } from "@/componentes/ui/input";
import { Label } from "@/componentes/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/componentes/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/componentes/ui/table";
import { mensagemDeErro } from "@/comum/erros";
import { dinheiro } from "@/comum/formato";
import { baixarCsv, coluna, numeroDaPlanilha, simOuNao } from "@/comum/planilha";
import type { ProdutoCompleto, ResultadoImportacaoProdutos } from "@/interfaces/admin";
import type { Categoria } from "@/interfaces/loja";

const CHAVE = ["produtos-admin"] as const;

const ESTOQUE_BAIXO = 5;

const AVISOS: Record<string, string> = {
  codigo_duplicado: "Já existe um produto com este código.",
  categoria_duplicada: "Já existe uma categoria com este nome.",
  nome_obrigatorio: "O nome não pode ficar em branco.",
  estoque_insuficiente: "A baixa é maior que o estoque disponível.",
  foto_url_longa: "Envie a foto para o storage e cole aqui só o endereço.",
};

const FORMULARIO_VAZIO = {
  nome: "",
  codigo: "",
  preco_venda: "",
  custo: "",
  categoria_id: "",
  foto_url: "",
};

export function Estoque() {
  const clienteConsulta = useQueryClient();
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [emEdicao, setEmEdicao] = useState<ProdutoCompleto | null>(null);
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [formulario, setFormulario] = useState(FORMULARIO_VAZIO);
  const [aAjustar, setAAjustar] = useState<ProdutoCompleto | null>(null);
  const [ajuste, setAjuste] = useState({ tipo: "entrada", quantidade: "", motivo: "" });
  const [novaCategoriaAberta, setNovaCategoriaAberta] = useState(false);
  const [nomeNovaCategoria, setNomeNovaCategoria] = useState("");
  const [categoriasAbertas, setCategoriasAbertas] = useState(false);

  const produtos = useQuery({
    queryKey: CHAVE,
    queryFn: () => api.get<ProdutoCompleto[]>("/produtos"),
    refetchInterval: 30_000,
  });
  const categorias = useQuery({
    queryKey: ["categorias"],
    queryFn: () => api.get<Categoria[]>("/produtos/categorias"),
  });

  const nomeCategoria = useMemo(() => {
    const mapa = new Map((categorias.data ?? []).map((c) => [c.id, c.nome]));
    return (id: string | null) => (id ? (mapa.get(id) ?? "—") : "—");
  }, [categorias.data]);

  const criarCategoria = useMutation({
    mutationFn: () => api.post<Categoria>("/produtos/categorias", { nome: nomeNovaCategoria.trim() }),
    onSuccess: (categoria) => {
      void clienteConsulta.invalidateQueries({ queryKey: ["categorias"] });
      setFormulario({ ...formulario, categoria_id: categoria.id });
      setNomeNovaCategoria("");
      setNovaCategoriaAberta(false);
    },
  });

  function recarregar() {
    void clienteConsulta.invalidateQueries({ queryKey: CHAVE });    void clienteConsulta.invalidateQueries({ queryKey: ["vitrine"] });
  }

  const salvar = useMutation({
    mutationFn: () => {
      const corpo = {
        nome: formulario.nome.trim(),
        codigo: formulario.codigo.trim(),
        preco_venda: formulario.preco_venda || "0",
        custo: formulario.custo || "0",
        categoria_id: formulario.categoria_id || null,
        foto_url: formulario.foto_url.trim() || null,
      };
      return emEdicao
        ? api.put<ProdutoCompleto>(`/produtos/${emEdicao.id}`, corpo)
        : api.post<ProdutoCompleto>("/produtos", corpo);
    },
    onSuccess: () => {
      recarregar();
      setFormularioAberto(false);
    },
  });

  const alternarAtivo = useMutation({
    mutationFn: (produto: ProdutoCompleto) =>
      api.patch(`/produtos/${produto.id}/ativo`, { ativo: !produto.ativo }),
    onSuccess: recarregar,
  });

  const ajustarEstoque = useMutation({
    mutationFn: () =>
      api.post(`/estoque/${aAjustar!.id}/ajustes`, {
        tipo: ajuste.tipo,
        quantidade: Number(ajuste.quantidade),
        motivo: ajuste.motivo.trim(),
      }),
    onSuccess: () => {
      recarregar();
      setAAjustar(null);
      setAjuste({ tipo: "entrada", quantidade: "", motivo: "" });
    },
  });

  function fecharCriacaoDeCategoria() {
    setNovaCategoriaAberta(false);
    setNomeNovaCategoria("");
    criarCategoria.reset();
  }

  function abrirCategorias() {
    setNomeNovaCategoria("");
    criarCategoria.reset();
    setCategoriasAbertas(true);
  }

  function abrirNovo() {
    setEmEdicao(null);
    setFormulario(FORMULARIO_VAZIO);
    salvar.reset();
    fecharCriacaoDeCategoria();
    setFormularioAberto(true);
  }

  function abrirEdicao(produto: ProdutoCompleto) {
    setEmEdicao(produto);
    setFormulario({
      nome: produto.nome,
      codigo: produto.codigo,
      preco_venda: produto.preco_venda,
      custo: produto.custo,
      categoria_id: produto.categoria_id ?? "",
      foto_url: produto.foto_url ?? "",
    });
    salvar.reset();
    fecharCriacaoDeCategoria();
    setFormularioAberto(true);
  }

  const visiveis = (produtos.data ?? []).filter((p) => {
    const termo = busca.trim().toLowerCase();
    const combinaBusca =
      !termo ||
      p.nome.toLowerCase().includes(termo) ||
      p.codigo.toLowerCase().includes(termo);
    const combinaCategoria =
      filtroCategoria === "todas" || p.categoria_id === filtroCategoria;
    return combinaBusca && combinaCategoria;
  });

  const erroLista = alternarAtivo.error;

  function exportar() {
    baixarCsv(
      "produtos-f8",
      visiveis.map((p) => ({
        Codigo: p.codigo,
        Nome: p.nome,
        Categoria: nomeCategoria(p.categoria_id),
        Custo: p.custo,
        "Preco de venda": p.preco_venda,
        Estoque: p.estoque,
        Ativo: p.ativo ? "Sim" : "Nao",
      })),
    );
  }

 
  function converterLinha(linha: Record<string, string>) {
    const codigo = coluna(linha, "codigo", "codigo do produto");
    if (!codigo) return "sem código na coluna Codigo";

    const custo = numeroDaPlanilha(coluna(linha, "custo", "custo unitario"));
    const venda = numeroDaPlanilha(
      coluna(linha, "preco de venda", "preco", "venda", "valor de venda"),
    );
    const estoque = numeroDaPlanilha(coluna(linha, "estoque", "quantidade"));
    const categoria = coluna(linha, "categoria");
    const ativo = simOuNao(coluna(linha, "ativo", "situacao"));

    return {
      codigo,
      ...(coluna(linha, "nome", "produto") ? { nome: coluna(linha, "nome", "produto") } : {}),
      ...(categoria ? { categoria } : {}),
      ...(custo !== null ? { custo } : {}),
      ...(venda !== null ? { preco_venda: venda } : {}),
      ...(estoque !== null ? { estoque: Math.trunc(Number(estoque)) } : {}),
      ...(ativo !== null ? { ativo } : {}),
    };
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">Estoque</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={exportar} disabled={visiveis.length === 0}>
            Exportar
          </Button>
          <ImportarPlanilha
            titulo="Importar produtos"
            descricao={
              "Casa pelo código: existente é atualizado, novo é criado. Coluna " +
              "em branco não mexe no que já está lá. O estoque informado entra " +
              "como ajuste, com motivo registrado."
            }
            nomeDoModelo="modelo-produtos-f8"
            modelo={{
              Codigo: "REF001",
              Nome: "Exemplo de produto",
              Categoria: categorias.data?.[0]?.nome ?? "",
              Custo: "2,00",
              "Preco de venda": "5,00",
              Estoque: 10,
              Ativo: "Sim",
            }}
            converter={converterLinha}
            enviar={(linhas) =>
              api.post<ResultadoImportacaoProdutos>("/produtos/importar", { linhas })
            }
            aoConcluir={recarregar}
          />
          <Button variant="outline" onClick={abrirCategorias}>
            Categorias
          </Button>
          <Button variant="destaque" onClick={abrirNovo}>
            Novo produto
          </Button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou código"
          className="w-full sm:w-64"
        />
        <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Categoria">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {(categorias.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {erroLista && (
        <div className="mb-4">
          <Aviso>{mensagemDeErro(erroLista, AVISOS)}</Aviso>
        </div>
      )}

      {produtos.isLoading && <Carregando />}
      {produtos.data && visiveis.length === 0 && <Vazio>Nenhum produto neste recorte.</Vazio>}

      {visiveis.length > 0 && (
        <Card className="overflow-x-auto">
          <Table className="tabela-admin">
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Venda</TableHead>
                <TableHead className="text-right">Margem</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((produto) => {
                const custo = Number(produto.custo);
                const venda = Number(produto.preco_venda);
                const margem = venda ? ((venda - custo) / venda) * 100 : 0;
                return (
                  <TableRow key={produto.id} className={produto.ativo ? "" : "opacity-50"}>
                    <TableCell>
                      <p className="text-sm font-semibold">{produto.nome}</p>
                      <p className="text-[11px] text-suave">{produto.codigo}</p>
                    </TableCell>
                    <TableCell className="text-sm text-suave">
                      {nomeCategoria(produto.categoria_id)}
                    </TableCell>
                    <TableCell className="text-right text-sm">{dinheiro(custo)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      {dinheiro(venda)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-suave">
                      {margem.toFixed(0)}%
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          produto.estoque <= ESTOQUE_BAIXO
                            ? "font-bold text-perigo"
                            : "font-semibold"
                        }
                      >
                        {produto.estoque}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {!produto.ativo && <Badge variant="outline">inativo</Badge>}
                        <Button size="sm" variant="outline" onClick={() => setAAjustar(produto)}>
                          Ajustar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => abrirEdicao(produto)}>
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => alternarAtivo.mutate(produto)}
                          disabled={alternarAtivo.isPending}
                        >
                          {produto.ativo ? "Desativar" : "Ativar"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* --- cadastro / edição --- */}
      <Dialog open={formularioAberto} onOpenChange={setFormularioAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{emEdicao ? "Editar produto" : "Novo produto"}</DialogTitle>
            <DialogDescription>
              O estoque não se muda aqui — ele só anda por ajuste, que fica registrado com
              motivo.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={formulario.nome}
                onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="codigo">Código</Label>
                <Input
                  id="codigo"
                  value={formulario.codigo}
                  onChange={(e) => setFormulario({ ...formulario, codigo: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="categoria">Categoria</Label>
                <Select
                  value={formulario.categoria_id || "nenhuma"}
                  onValueChange={(v) =>
                    setFormulario({ ...formulario, categoria_id: v === "nenhuma" ? "" : v })
                  }
                >
                  <SelectTrigger id="categoria">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">Sem categoria</SelectItem>
                    {(categorias.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {novaCategoriaAberta ? (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Input
                      autoFocus
                      value={nomeNovaCategoria}
                      onChange={(e) => setNomeNovaCategoria(e.target.value)}
                      placeholder="Nome da categoria"
                      className="h-8 text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 shrink-0"
                      disabled={!nomeNovaCategoria.trim() || criarCategoria.isPending}
                      onClick={() => criarCategoria.mutate()}
                    >
                      {criarCategoria.isPending ? "Criando…" : "Criar"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0"
                      onClick={fecharCriacaoDeCategoria}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="mt-0.5 h-auto justify-start p-0 text-xs text-suave"
                    onClick={() => setNovaCategoriaAberta(true)}
                  >
                    + Nova categoria
                  </Button>
                )}
                {criarCategoria.error && (
                  <p className="text-[11px] text-perigo">
                    {mensagemDeErro(criarCategoria.error, AVISOS)}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="custo">Custo</Label>
                <CampoDinheiro
                  id="custo"
                  valor={formulario.custo}
                  aoMudar={(custo) => setFormulario({ ...formulario, custo })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="venda">Preço de venda</Label>
                <CampoDinheiro
                  id="venda"
                  valor={formulario.preco_venda}
                  aoMudar={(preco_venda) => setFormulario({ ...formulario, preco_venda })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="foto">Endereço da foto (opcional)</Label>
              <Input
                id="foto"
                value={formulario.foto_url}
                onChange={(e) => setFormulario({ ...formulario, foto_url: e.target.value })}
                placeholder="https://…"
              />
            </div>

            {salvar.error && <Aviso>{mensagemDeErro(salvar.error, AVISOS)}</Aviso>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormularioAberto(false)}>
              Cancelar
            </Button>
            <Button
              variant="destaque"
              onClick={() => salvar.mutate()}
              disabled={!formulario.nome.trim() || !formulario.codigo.trim() || salvar.isPending}
            >
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- categorias --- */}
      <Dialog open={categoriasAbertas} onOpenChange={setCategoriasAbertas}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Categorias</DialogTitle>
            <DialogDescription>
              Usadas para organizar e filtrar os produtos da loja.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-56 overflow-y-auto rounded-lg border border-borda">
            {(categorias.data ?? []).length === 0 && (
              <p className="p-3 text-sm text-suave">Nenhuma categoria cadastrada ainda.</p>
            )}
            {(categorias.data ?? []).map((c) => (
              <p key={c.id} className="border-b border-borda px-3 py-2 text-sm last:border-b-0">
                {c.nome}
              </p>
            ))}
          </div>

          <div>
            <Label htmlFor="categoria-nova">Nova categoria</Label>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Input
                id="categoria-nova"
                value={nomeNovaCategoria}
                onChange={(e) => setNomeNovaCategoria(e.target.value)}
                placeholder="Nome da categoria"
              />
              <Button
                type="button"
                className="shrink-0"
                disabled={!nomeNovaCategoria.trim() || criarCategoria.isPending}
                onClick={() => criarCategoria.mutate()}
              >
                {criarCategoria.isPending ? "Criando…" : "Criar"}
              </Button>
            </div>
            {criarCategoria.error && (
              <p className="mt-1.5 text-[11px] text-perigo">
                {mensagemDeErro(criarCategoria.error, AVISOS)}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoriasAbertas(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- ajuste de estoque --- */}
      <Dialog open={aAjustar !== null} onOpenChange={(aberto) => !aberto && setAAjustar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar estoque</DialogTitle>
            <DialogDescription>
              {aAjustar?.nome} — hoje com {aAjustar?.estoque} em estoque. O motivo fica no
              histórico.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="tipo">Tipo</Label>
                <Select
                  value={ajuste.tipo}
                  onValueChange={(v) => setAjuste({ ...ajuste, tipo: v })}
                >
                  <SelectTrigger id="tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada</SelectItem>
                    <SelectItem value="baixa">Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="quantidade">Quantidade</Label>
                <CampoInteiro
                  id="quantidade"
                  digitos={6}
                  valor={ajuste.quantidade}
                  aoMudar={(quantidade) => setAjuste({ ...ajuste, quantidade })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="motivo-ajuste">Motivo</Label>
              <Input
                id="motivo-ajuste"
                value={ajuste.motivo}
                onChange={(e) => setAjuste({ ...ajuste, motivo: e.target.value })}
                placeholder="Compra, perda, contagem, vencimento…"
              />
            </div>

            {ajustarEstoque.error && (
              <Aviso>{mensagemDeErro(ajustarEstoque.error, AVISOS)}</Aviso>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAAjustar(null)}>
              Cancelar
            </Button>
            <Button
              variant="destaque"
              onClick={() => ajustarEstoque.mutate()}
              disabled={
                Number(ajuste.quantidade) <= 0 ||
                ajuste.motivo.trim().length < 3 ||
                ajustarEstoque.isPending
              }
            >
              {ajustarEstoque.isPending ? "Aplicando…" : "Aplicar ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
