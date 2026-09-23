import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { api } from "@/api/cliente";
import { Moldura } from "@/componentes/Moldura";
import { Button } from "@/componentes/ui/button";
import { Card, CardContent } from "@/componentes/ui/card";
import { dataHora, dinheiro, hora } from "@/comum/formato";
import { GRADE_CARTOES, PAGINA_APP } from "@/comum/layout";
import { visiveis } from "@/comum/navegacao";
import { cn } from "@/comum/utilitarios";
import { usePendencias } from "@/hooks/pendencias";
import { useSair } from "@/hooks/sessao";
import type { AlmocoDoDia } from "@/interfaces/almoco";
import type { Extrato } from "@/interfaces/consumo";
import type { Pedido } from "@/interfaces/loja";
import type { Eu } from "@/interfaces/sessao";

export function Inicio({ eu }: { eu: Eu }) {
  const sair = useSair();
  const pendencias = usePendencias(eu.papel);
  const balcao = visiveis(eu.papel, "balcao");
  const gestao = visiveis(eu.papel, "gestao");

  const almoco = useQuery({
    queryKey: ["almoco-hoje"],
    queryFn: () => api.get<AlmocoDoDia | null>("/almocos/meu-hoje"),
  });
  const extrato = useQuery({
    queryKey: ["extrato", "atual"],
    queryFn: () => api.get<Extrato>("/consumo/me"),
  });
  const pedidos = useQuery({
    queryKey: ["meus-pedidos"],
    queryFn: () => api.get<Pedido[]>("/pedidos/me"),
  });

  const hoje = almoco.data;
  const aguardando = (pedidos.data ?? []).filter((p) => p.status === "pendente");

  return (
    <Moldura>
      <header className="bg-ink">
        <div className={cn(PAGINA_APP, "flex items-start justify-between gap-3 pt-6 pb-5")}>
          <div className="min-w-0">
            <p className="text-sm leading-none font-semibold text-white">
              Olá, {eu.nome_completo.split(" ")[0]}
            </p>
            <p className="mt-1 truncate text-[11px] text-white/50">
              {eu.empresa?.nome ?? "sem empresa"}
            </p>
          </div>
          <Button
            variant="link"
            size="sm"
            onClick={() => sair.mutate()}
            className="h-auto p-0 text-[11px] text-white/60"
          >
            Sair
          </Button>
        </div>
      </header>

      <div className={cn(PAGINA_APP, "py-6")}>
        <div className={GRADE_CARTOES}>
          {/* Primeiro de tudo: é o lembrete de que tem coisa esperando por ela
              no balcão, que some assim que o pedido é entregue. */}
          {aguardando.map((pedido) => (
            <Card key={pedido.id} className="border-accent col-span-full">
              <CardContent className="p-4 text-center">
                <p className="text-sm font-bold">Pedido aguardando retirada</p>
                <p className="mt-1 text-lg font-extrabold">
                  {dinheiro(pedido.valor_total)}
                </p>
                <p className="mt-1 text-[11px] text-suave">
                  Retire na recepção. Feito em {dataHora(pedido.criado_em)}.
                </p>
              </CardContent>
            </Card>
          ))}

         
          {balcao.map((destino) => {
            const fila = destino.contador ? pendencias[destino.contador] : 0;
            return (
              <Card key={destino.rotulo} className="border-ink bg-ink text-white">
                <CardContent className="flex h-full flex-col p-4">
                  <h2 className="text-sm font-bold">{destino.rotulo}</h2>
                  <p className="mt-1 text-sm text-white/60">{destino.descricao}</p>
                  <p className="mt-3 text-3xl font-black text-accent">{fila}</p>
                  <p className="text-[11px] text-white/50">
                    {destino.contador === "almocos" ? "aguardando leitura" : "aguardando retirada"}
                  </p>
                  <Button asChild variant="destaque" className="mt-3 w-full">
                    <Link to={destino.para}>Abrir</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}

          <Card>
            <CardContent className="p-4">
              <h2 className="mb-2 text-sm font-bold">Almoço de hoje</h2>
              {hoje?.status === "confirmado" ? (
                <>
                  <p className="text-sm font-semibold text-sucesso">
                    Já liberado{hoje.confirmado_em ? ` às ${hora(hoje.confirmado_em)}` : ""}.
                  </p>
                  <p className="text-xs text-suave">Confirmado no refeitório.</p>
                </>
              ) : hoje?.status === "pendente" ? (
                <>
                  <p className="mb-3 text-sm text-suave">
                    Código gerado às {hora(hoje.criado_em)}, aguardando leitura.
                  </p>
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/almoco">Ver código de barras</Link>
                  </Button>
                </>
              ) : (
                <>
                  <p className="mb-3 text-sm text-suave">
                    Você ainda não liberou o almoço de hoje.
                  </p>
                  <Button asChild variant="destaque" className="w-full">
                    <Link to="/almoco">Liberar almoço de hoje</Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h2 className="mb-2 text-sm font-bold">Loja interna</h2>
              <p className="mb-3 text-sm text-suave">
                Energéticos, refrigerantes, água com gás e picolés.
              </p>
              <Button asChild variant="destaque" className="w-full">
                <Link to="/loja">Comprar itens</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-bold">Meu consumo</h2>
                <Link to="/consumo" className="text-xs font-semibold text-suave">
                  Ver tudo →
                </Link>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-suave">Gasto na loja este mês</span>
                <span className="font-bold">{dinheiro(extrato.data?.total_loja ?? 0)}</span>
              </div>
              <div className="mt-1 flex justify-between text-sm">
                <span className="text-suave">Almoços este mês</span>
                <span className="font-bold">{extrato.data?.quantidade_almocos ?? 0}</span>
              </div>
            </CardContent>
          </Card>

          
          {gestao.length > 0 && (
            <Card className="col-span-full">
              <CardContent className="p-4">
                <h2 className="mb-3 text-sm font-bold">Gestão</h2>
                <div className="flex flex-wrap gap-2">
                  {gestao.map((destino) => (
                    <Button key={destino.rotulo} asChild variant="outline" size="sm">
                      <Link to={destino.para}>{destino.rotulo}</Link>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Moldura>
  );
}
