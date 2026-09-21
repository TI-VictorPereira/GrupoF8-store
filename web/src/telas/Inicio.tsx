import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { api } from "@/api/cliente";
import { Moldura } from "@/componentes/Moldura";
import { Button } from "@/componentes/ui/button";
import { Card, CardContent } from "@/componentes/ui/card";
import { dinheiro, hora } from "@/comum/formato";
import { useSair } from "@/comum/sessao";
import type { AlmocoDoDia } from "@/interfaces/almoco";
import type { Extrato } from "@/interfaces/consumo";
import type { Pedido } from "@/interfaces/loja";
import type { Eu } from "@/interfaces/sessao";

export function Inicio({ eu }: { eu: Eu }) {
  const sair = useSair();

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
      <header className="flex items-start justify-between gap-3 bg-ink px-5 pt-6 pb-5">
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
      </header>

      <div className="flex flex-col gap-4 p-5">
        {/* Primeiro de tudo: é o que a pessoa precisa mostrar no balcão, e
            sem isto aqui ela só veria o código na tela logo após a compra. */}
        {aguardando.map((pedido) => (
          <Card key={pedido.id} className="border-accent">
            <CardContent className="p-4 text-center">
              <p className="text-[11px] text-suave">
                Pedido aguardando retirada · {dinheiro(pedido.valor_total)}
              </p>
              <p className="mt-1 font-mono text-4xl font-black tracking-[0.2em]">
                {pedido.codigo_retirada}
              </p>
              <p className="mt-1 text-[11px] text-suave">
                Mostre este código na loja para retirar.
              </p>
            </CardContent>
          </Card>
        ))}

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

        {eu.papel !== "colaborador" && (
          <Card className="border-ink bg-ink text-white">
            <CardContent className="p-4">
              <h2 className="mb-2 text-sm font-bold">Painel do refeitório</h2>
              <p className="mb-3 text-sm text-white/60">
                Conferir códigos no balcão e acompanhar a fila do dia.
              </p>
              <Button asChild variant="destaque" className="w-full">
                <Link to="/refeitorio">Abrir painel</Link>
              </Button>
              {eu.papel === "admin" && (
                <Button
                  asChild
                  variant="outline"
                  className="mt-2 w-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                >
                  <Link to="/admin/entregas">Administração</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Moldura>
  );
}
