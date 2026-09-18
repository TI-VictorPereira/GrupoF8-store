import { useQuery } from "@tanstack/react-query";

import { api, type Eu, type ProdutoVitrine } from "@/api/cliente";
import { useSair } from "@/comum/sessao";

const NOME_DO_PAPEL: Record<string, string> = {
  colaborador: "Colaborador",
  refeitorio: "Refeitório",
  admin: "Administração",
};

/**
 * Tela provisória de verificação.
 *
 * Existe para confirmar que a cadeia inteira funciona — navegador, proxy,
 * cookie de sessão, API e banco. As telas de verdade (loja, almoço, consumo,
 * painel e admin) são as etapas seguintes da fase 7.
 */
export function Inicio({ eu }: { eu: Eu }) {
  const sair = useSair();
  const vitrine = useQuery({
    queryKey: ["vitrine"],
    queryFn: () => api.get<ProdutoVitrine[]>("/produtos/vitrine"),
  });

  return (
    <div className="mx-auto min-h-screen max-w-md">
      <header className="flex items-start justify-between gap-3 bg-ink px-5 pt-6 pb-5 text-bg">
        <div>
          <p className="text-sm leading-none font-semibold text-white">
            Olá, {eu.nome_completo.split(" ")[0]}
          </p>
          <p className="mt-1 text-[11px] text-white/50">
            {NOME_DO_PAPEL[eu.papel] ?? eu.papel} · {eu.empresa?.nome ?? "sem empresa"}
          </p>
        </div>
        <button
          onClick={() => sair.mutate()}
          className="shrink-0 text-[11px] font-semibold text-white/60"
        >
          Sair
        </button>
      </header>

      <div className="flex flex-col gap-4 p-5">
        <section className="rounded-xl border border-borda bg-card p-4">
          <h2 className="mb-2 text-sm font-bold">Sessão ativa</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-suave">Código</dt>
            <dd className="font-medium">{eu.codigo}</dd>
            <dt className="text-suave">Papel</dt>
            <dd className="font-medium">{eu.papel}</dd>
            <dt className="text-suave">Empresa</dt>
            <dd className="font-medium">
              {eu.empresa ? `${eu.empresa.nome} (codemp ${eu.empresa.codemp})` : "—"}
            </dd>
          </dl>
        </section>

        <section className="rounded-xl border border-borda bg-card p-4">
          <h2 className="mb-3 text-sm font-bold">Loja interna</h2>
          {vitrine.isLoading && <p className="text-sm text-suave">Carregando…</p>}
          {vitrine.error && (
            <p className="text-sm text-perigo">Não foi possível carregar os produtos.</p>
          )}
          {vitrine.data?.length === 0 && (
            <p className="text-sm text-suave">Nenhum produto ativo no momento.</p>
          )}
          <ul className="flex flex-col">
            {vitrine.data?.map((produto) => (
              <li
                key={produto.id}
                className="flex items-center justify-between border-b border-borda py-2 text-sm last:border-b-0"
              >
                <span>{produto.nome}</span>
                <span className="flex items-center gap-3">
                  <span className="text-[11px] text-muito-suave">
                    {produto.estoque > 0 ? `${produto.estoque} un.` : "sem estoque"}
                  </span>
                  <strong>
                    {Number(produto.preco_venda).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </strong>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-center text-[11px] text-muito-suave">
          Telas de loja, almoço, consumo, painel e administração ainda serão construídas.
        </p>
      </div>
    </div>
  );
}
