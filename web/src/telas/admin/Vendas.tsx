import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { Carregando } from "@/componentes/Carregando";
import { TableHeadOrdenavel } from "@/componentes/TableHeadOrdenavel";
import { Vazio } from "@/componentes/Vazio";
import { Button } from "@/componentes/ui/button";
import { Card, CardContent } from "@/componentes/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/componentes/ui/table";
import { mensagemDeErro } from "@/comum/erros";
import { FiltroPeriodo } from "@/componentes/FiltroPeriodo";
import { dataHora, dinheiro } from "@/comum/formato";
import { ordenar, useOrdenacao } from "@/comum/ordenacao";
import { intervaloDoFiltro, periodoInicial } from "@/comum/periodo";
import { baixarCsv } from "@/comum/planilha";
import type { LinhaPedido } from "@/interfaces/admin";
import type { LinhaPainel } from "@/interfaces/refeitorio";

const AVISOS: Record<string, string> = {
  periodo_invalido: "A data final não pode ser anterior à inicial.",
};

interface Totais {
  receita: number;
  custo: number;
  unidades: number;
}

interface LinhaProduto extends Totais {
  nome: string;
  lucro: number;
  margem: number;
}

type ColunaProduto = "nome" | "unidades" | "receita" | "custo" | "lucro" | "margem";

function valorOrdenavel(linha: LinhaProduto, coluna: ColunaProduto): string | number {
  return coluna === "nome" ? linha.nome.toLowerCase() : linha[coluna];
}

export function Vendas() {
  const [filtro, setFiltro] = useState(() => periodoInicial("ciclo"));
  const { de, ate } = intervaloDoFiltro(filtro);

  const vendas = useQuery({
    queryKey: ["vendas", de, ate],
    queryFn: () => api.get<LinhaPedido[]>(`/pedidos?de=${de}&ate=${ate}`),
  });
  const almocos = useQuery({
    queryKey: ["almocos-historico", de, ate],
    queryFn: () => api.get<LinhaPainel[]>(`/almocos?de=${de}&ate=${ate}`),
  });

  
  const validos = useMemo(
    () => (vendas.data ?? []).filter((l) => l.pedido.status !== "cancelado"),
    [vendas.data],
  );

  const totais = useMemo<Totais>(
    () =>
      validos.reduce(
        (acumulado, linha) => {
          for (const item of linha.pedido.itens) {
            acumulado.receita += Number(item.preco_unitario) * item.quantidade;
            acumulado.custo += Number(item.custo_unitario) * item.quantidade;
            acumulado.unidades += item.quantidade;
          }
          return acumulado;
        },
        { receita: 0, custo: 0, unidades: 0 },
      ),
    [validos],
  );

  const porProduto = useMemo<LinhaProduto[]>(() => {
    const mapa = new Map<string, Totais>();
    for (const linha of validos) {
      for (const item of linha.pedido.itens) {
        const atual = mapa.get(item.nome_produto) ?? { receita: 0, custo: 0, unidades: 0 };
        atual.receita += Number(item.preco_unitario) * item.quantidade;
        atual.custo += Number(item.custo_unitario) * item.quantidade;
        atual.unidades += item.quantidade;
        mapa.set(item.nome_produto, atual);
      }
    }
    return [...mapa.entries()].map(([nome, dados]) => {
      const lucro = dados.receita - dados.custo;
      return { nome, ...dados, lucro, margem: dados.receita ? (lucro / dados.receita) * 100 : 0 };
    });
  }, [validos]);

  const ordenacaoProduto = useOrdenacao<ColunaProduto>("receita", "desc");
  const produtosOrdenados = useMemo(
    () => ordenar(porProduto, ordenacaoProduto, valorOrdenavel),
    [porProduto, ordenacaoProduto],
  );

  const lucro = totais.receita - totais.custo;
  const margem = totais.receita ? (lucro / totais.receita) * 100 : 0;
  const almocosConfirmados = (almocos.data ?? []).filter(
    (l) => l.almoco.status === "confirmado",
  );

  /** Uma linha por item comprado e por almoço — o detalhado do Sankhya. */
  function exportarConsumo() {
    const daLoja = validos.flatMap((linha) =>
      linha.pedido.itens.map((item) => ({
        Código: linha.colaborador_codigo,
        Colaborador: linha.colaborador_nome,
        Departamento: linha.departamento ?? "—",
        Data: dataHora(linha.pedido.criado_em),
        Tipo: "Compra na loja",
        Item: item.nome_produto,
        Categoria: item.categoria ?? "—",
        Quantidade: item.quantidade,
        "Valor unitário": Number(item.preco_unitario).toFixed(2),
        "Valor total": (Number(item.preco_unitario) * item.quantidade).toFixed(2),
        "Código do pedido": linha.pedido.codigo_retirada,
        Status: linha.pedido.status,
      })),
    );
    const doRefeitorio = almocosConfirmados.map((linha) => ({
      Código: linha.colaborador_codigo,
      Colaborador: linha.colaborador_nome,
      Departamento: linha.departamento ?? "—",
      Data: dataHora(linha.almoco.criado_em),
      Tipo: "Almoço",
      Item: "Almoço no refeitório",
      Categoria: linha.almoco.origem === "manual" ? "Registro manual" : "Totem",
      Quantidade: 1,
      "Valor unitário": Number(linha.almoco.valor).toFixed(2),
      "Valor total": Number(linha.almoco.valor).toFixed(2),
      "Código de retirada": "—",
      Status: linha.almoco.status,
    }));

    baixarCsv(
      `consumo-detalhado-f8-${de}_a_${ate}`,
      [...daLoja, ...doRefeitorio].sort((a, b) => a.Colaborador.localeCompare(b.Colaborador)),
    );
  }

  /** Uma linha por pessoa — o resumo do Sankhya. */
  function exportarPorColaborador() {
    type Resumo = {
      codigo: string;
      nome: string;
      departamento: string;
      compras: number;
      itens: number;
      almocos: number;
      valor: number;
    };
    const mapa = new Map<string, Resumo>();

    const garantir = (codigo: string, nome: string, departamento: string | null): Resumo => {
      const atual = mapa.get(codigo) ?? {
        codigo,
        nome,
        departamento: departamento ?? "—",
        compras: 0,
        itens: 0,
        almocos: 0,
        valor: 0,
      };
      mapa.set(codigo, atual);
      return atual;
    };

    for (const linha of validos) {
      const resumo = garantir(
        linha.colaborador_codigo,
        linha.colaborador_nome,
        linha.departamento,
      );
      resumo.compras += 1;
      for (const item of linha.pedido.itens) {
        resumo.itens += item.quantidade;
        resumo.valor += Number(item.preco_unitario) * item.quantidade;
      }
    }
    for (const linha of almocosConfirmados) {
      const resumo = garantir(
        linha.colaborador_codigo,
        linha.colaborador_nome,
        linha.departamento,
      );
      resumo.almocos += 1;
      resumo.valor += Number(linha.almoco.valor);
    }

    baixarCsv(
      `consumo-por-colaborador-f8-${de}_a_${ate}`,
      [...mapa.values()]
        .sort((a, b) => b.valor - a.valor)
        .map((r) => ({
          Código: r.codigo,
          Colaborador: r.nome,
          Departamento: r.departamento,
          "Compras realizadas": r.compras,
          "Itens comprados": r.itens,
          "Almoços confirmados": r.almocos,
          "Valor total": r.valor.toFixed(2),
        })),
    );
  }

  const erro = vendas.error ?? almocos.error;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">Vendas</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportarConsumo} disabled={!validos.length}>
            Consumo detalhado
          </Button>
          <Button variant="destaque" onClick={exportarPorColaborador} disabled={!validos.length}>
            Por colaborador
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <FiltroPeriodo valor={filtro} aoMudar={setFiltro} />
      </div>

      {erro && (
        <div className="mb-4">
          <Aviso>{mensagemDeErro(erro, AVISOS)}</Aviso>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-suave">Receita</p>
            <p className="mt-1 text-xl font-bold">{dinheiro(totais.receita)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-suave">Lucro</p>
            <p className="mt-1 text-xl font-bold text-sucesso">{dinheiro(lucro)}</p>
            <p className="text-[11px] text-muito-suave">{margem.toFixed(0)}% de margem</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-suave">Itens vendidos</p>
            <p className="mt-1 text-xl font-bold">{totais.unidades}</p>
            <p className="text-[11px] text-muito-suave">{validos.length} pedidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-suave">Almoços</p>
            <p className="mt-1 text-xl font-bold">{almocosConfirmados.length}</p>
            <p className="text-[11px] text-muito-suave">confirmados</p>
          </CardContent>
        </Card>
      </div>

      {(vendas.isLoading || almocos.isLoading) && <Carregando />}
      {vendas.data && porProduto.length === 0 && <Vazio>Nenhuma venda neste período.</Vazio>}

      {porProduto.length > 0 && (
        <Card className="overflow-x-auto">
          <Table className="tabela-admin">
            <TableHeader>
              <TableRow>
                <TableHeadOrdenavel
                  coluna="nome"
                  estado={ordenacaoProduto}
                  aoClicar={ordenacaoProduto.alternar}
                >
                  Produto
                </TableHeadOrdenavel>
                <TableHeadOrdenavel
                  coluna="unidades"
                  estado={ordenacaoProduto}
                  aoClicar={ordenacaoProduto.alternar}
                  alinhar="direita"
                >
                  Unidades
                </TableHeadOrdenavel>
                <TableHeadOrdenavel
                  coluna="receita"
                  estado={ordenacaoProduto}
                  aoClicar={ordenacaoProduto.alternar}
                  alinhar="direita"
                >
                  Receita
                </TableHeadOrdenavel>
                <TableHeadOrdenavel
                  coluna="custo"
                  estado={ordenacaoProduto}
                  aoClicar={ordenacaoProduto.alternar}
                  alinhar="direita"
                >
                  Custo
                </TableHeadOrdenavel>
                <TableHeadOrdenavel
                  coluna="lucro"
                  estado={ordenacaoProduto}
                  aoClicar={ordenacaoProduto.alternar}
                  alinhar="direita"
                >
                  Lucro
                </TableHeadOrdenavel>
                <TableHeadOrdenavel
                  coluna="margem"
                  estado={ordenacaoProduto}
                  aoClicar={ordenacaoProduto.alternar}
                  alinhar="direita"
                >
                  Margem
                </TableHeadOrdenavel>
              </TableRow>
            </TableHeader>
            <TableBody>
              {produtosOrdenados.map((linha) => (
                <TableRow key={linha.nome}>
                  <TableCell className="text-sm font-semibold">{linha.nome}</TableCell>
                  <TableCell className="text-right text-sm">{linha.unidades}</TableCell>
                  <TableCell className="text-right text-sm">{dinheiro(linha.receita)}</TableCell>
                  <TableCell className="text-right text-sm text-suave">
                    {dinheiro(linha.custo)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold text-sucesso">
                    {dinheiro(linha.lucro)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-suave">
                    {linha.margem.toFixed(0)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
