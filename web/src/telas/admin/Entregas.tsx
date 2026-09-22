import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { Carregando } from "@/componentes/Carregando";
import { Vazio } from "@/componentes/Vazio";
import { Button } from "@/componentes/ui/button";
import { Card, CardContent } from "@/componentes/ui/card";
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
import { mensagemDeErro } from "@/comum/erros";
import { dataHora, dinheiro } from "@/comum/formato";
import type { LinhaEntrega } from "@/interfaces/admin";

const CHAVE = ["pedidos-pendentes"] as const;

const AVISOS: Record<string, string> = {
  pedido_nao_pendente: "Alguém já tratou este pedido. A lista foi atualizada.",
};

export function Entregas() {
  const clienteConsulta = useQueryClient();
  const [aCancelar, setACancelar] = useState<LinhaEntrega | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busca, setBusca] = useState("");
  const [confirmado, setConfirmado] = useState<string | null>(null);

  const pendentes = useQuery({
    queryKey: CHAVE,
    queryFn: () => api.get<LinhaEntrega[]>("/pedidos/pendentes"),
    refetchInterval: 15_000,
  });

  function recarregar() {
    void clienteConsulta.invalidateQueries({ queryKey: CHAVE });
    void clienteConsulta.invalidateQueries({ queryKey: ["admin-pendencias"] });
  }

  /**
   * O estoque saiu da prateleira na compra, não aqui. Entregar só muda o
   * status; cancelar devolve as unidades e por isso precisa avisar as telas
   * que mostram estoque — sem isto a aba Estoque continua com o número de
   * antes do cancelamento.
   */
  function recarregarEstoque() {
    void clienteConsulta.invalidateQueries({ queryKey: ["produtos-admin"] });
    void clienteConsulta.invalidateQueries({ queryKey: ["vitrine"] });
  }

  const entregar = useMutation({
    mutationFn: (linha: LinhaEntrega) => api.post(`/pedidos/${linha.pedido.id}/entregar`),
    onSuccess: (_resposta, linha) => {
      setConfirmado(linha.colaborador_nome);
      recarregar();
    },
  });

  const cancelar = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api.post(`/pedidos/${id}/cancelar`, { motivo }),
    onSuccess: () => {
      recarregar();
      recarregarEstoque();
      setACancelar(null);
      setMotivo("");
    },
  });

  // Filtra sobre `pendentes.data` e não sobre uma lista já derivada: `?? []`
  // devolve um array novo a cada render, e o memo nunca memorizaria nada.
  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const todas = pendentes.data ?? [];
    if (!termo) return todas;
    return todas.filter(
      (l) =>
        l.colaborador_nome.toLowerCase().includes(termo) ||
        l.colaborador_codigo.toLowerCase().includes(termo),
    );
  }, [pendentes.data, busca]);
  const total = pendentes.data?.length ?? 0;
  const erro = entregar.error ?? cancelar.error;

  // A confirmação some sozinha: ninguém no balcão vai clicar para fechar, e
  // um "entregue" parado na tela confunde a próxima pessoa da fila.
  useEffect(() => {
    if (!confirmado) return;
    const id = setTimeout(() => setConfirmado(null), 5000);
    return () => clearTimeout(id);
  }, [confirmado]);

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-lg font-bold">Entregas</h1>
        <p className="text-xs text-suave">
          {total} {total === 1 ? "pedido aguardando" : "pedidos aguardando"}
        </p>
      </div>

      {confirmado && (
        <Card role="status" className="mb-4 border-sucesso/30 bg-sucesso/10">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="size-8 shrink-0 text-sucesso" />
            <div className="min-w-0">
              <p className="truncate text-xl font-extrabold text-sucesso">{confirmado}</p>
              <p className="text-sm text-suave">Entrega confirmada</p>
            </div>
          </CardContent>
        </Card>
      )}

      {erro && (
        <div className="mb-4">
          <Aviso>{mensagemDeErro(erro, AVISOS)}</Aviso>
        </div>
      )}

      {/* Com a fila cheia, achar a pessoa na lista é o que toma tempo no
          balcão. O crachá dela traz nome e código, que é por onde se busca. */}
      {total > 0 && (
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Achar pelo nome ou pelo código do colaborador"
          className="mb-3"
        />
      )}

      {pendentes.isLoading && <Carregando />}
      {pendentes.data && linhas.length === 0 && (
        <Vazio>
          {total === 0
            ? "Nenhum pedido aguardando retirada."
            : "Ninguém na fila com esse nome ou código."}
        </Vazio>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {linhas.map((linha) => (
          <Card key={linha.pedido.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{linha.colaborador_nome}</p>
                  <p className="truncate text-[11px] text-suave">
                    {linha.colaborador_codigo}
                    {linha.departamento ? ` · ${linha.departamento}` : ""} ·{" "}
                    {dataHora(linha.pedido.criado_em)}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-suave">
                  aguardando
                </span>
              </div>

              <div className="mt-3 border-t border-borda pt-2">
                {linha.pedido.itens.map((item, indice) => (
                  <div
                    key={`${item.produto_id ?? item.nome_produto}-${indice}`}
                    className="flex justify-between py-0.5 text-[13px]"
                  >
                    <span className="text-suave">
                      {item.quantidade}× {item.nome_produto}
                    </span>
                    <span className="font-semibold">
                      {dinheiro(Number(item.preco_unitario) * item.quantidade)}
                    </span>
                  </div>
                ))}
                <div className="mt-1 flex justify-between border-t border-borda pt-1.5 text-sm font-extrabold">
                  <span>Total</span>
                  <span>{dinheiro(linha.pedido.valor_total)}</span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setACancelar(linha)}
                  disabled={cancelar.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destaque"
                  size="sm"
                  onClick={() => entregar.mutate(linha)}
                  disabled={entregar.isPending}
                >
                  Entregar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={aCancelar !== null} onOpenChange={(aberto) => !aberto && setACancelar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar pedido</DialogTitle>
            <DialogDescription>
              O estoque volta para a prateleira e o valor sai do consumo de{" "}
              {aCancelar?.colaborador_nome}. O motivo fica registrado.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="motivo">Motivo</Label>
            <Input
              id="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Desistiu, produto trocado, erro de lançamento…"
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setACancelar(null)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={motivo.trim().length < 3 || cancelar.isPending}
              onClick={() =>
                aCancelar && cancelar.mutate({ id: aCancelar.pedido.id, motivo: motivo.trim() })
              }
            >
              {cancelar.isPending ? "Cancelando…" : "Cancelar pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
