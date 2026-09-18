import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { api } from "@/api/cliente";
import { Moldura } from "@/componentes/Moldura";
import { dinheiro, hora } from "@/comum/formato";
import { useSair } from "@/comum/sessao";
import type { AlmocoDoDia } from "@/interfaces/almoco";
import type { Extrato } from "@/interfaces/consumo";
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

  const hoje = almoco.data;

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
        <button
          onClick={() => sair.mutate()}
          className="mt-0.5 shrink-0 text-[11px] font-semibold text-white/60"
        >
          Sair
        </button>
      </header>

      <div className="flex flex-col gap-4 p-5">
        <section className="rounded-xl border border-borda p-4">
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
              <Link
                to="/almoco"
                className="block rounded-lg border border-borda py-2.5 text-center text-sm font-bold"
              >
                Ver código de barras
              </Link>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-suave">Você ainda não liberou o almoço de hoje.</p>
              <Link
                to="/almoco"
                className="block rounded-lg bg-accent py-2.5 text-center text-sm font-bold text-ink"
              >
                Liberar almoço de hoje
              </Link>
            </>
          )}
        </section>

        <section className="rounded-xl border border-borda p-4">
          <h2 className="mb-2 text-sm font-bold">Loja interna</h2>
          <p className="mb-3 text-sm text-suave">
            Energéticos, refrigerantes, água com gás e picolés.
          </p>
          <Link
            to="/loja"
            className="block rounded-lg bg-accent py-2.5 text-center text-sm font-bold text-ink"
          >
            Comprar itens
          </Link>
        </section>

        <section className="rounded-xl border border-borda p-4">
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
        </section>

        {eu.papel !== "colaborador" && (
          <section className="rounded-xl border border-ink bg-ink p-4 text-white">
            <h2 className="mb-2 text-sm font-bold">Painel do refeitório</h2>
            <p className="mb-3 text-sm text-white/60">
              Conferir códigos no balcão e acompanhar a fila do dia.
            </p>
            <Link
              to="/refeitorio"
              className="block rounded-lg bg-accent py-2.5 text-center text-sm font-bold text-ink"
            >
              Abrir painel
            </Link>
            {eu.papel === "admin" && (
              <p className="mt-3 text-[11px] text-white/40">
                A administração ainda será construída.
              </p>
            )}
          </section>
        )}
      </div>
    </Moldura>
  );
}
