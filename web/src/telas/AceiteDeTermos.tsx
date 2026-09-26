import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { Carregando } from "@/componentes/Carregando";
import { Button } from "@/componentes/ui/button";
import { mensagemDeErro } from "@/comum/erros";
import { CHAVE_EU, useSair } from "@/hooks/sessao";
import type { Eu } from "@/interfaces/sessao";

interface SecaoTermos {
  titulo: string;
  paragrafos: string[];
}

interface Termos {
  versao: string;
  secoes: SecaoTermos[];
}


export function AceiteDeTermos() {
  const clienteConsulta = useQueryClient();
  const sair = useSair();

  const termos = useQuery({
    queryKey: ["termos"],
    queryFn: () => api.get<Termos>("/auth/termos"),
  });

  const aceitar = useMutation({
    mutationFn: () => api.post<Eu>("/auth/aceitar-termos"),
    onSuccess: (eu) => clienteConsulta.setQueryData(CHAVE_EU, eu),
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-lg font-bold">Termo de uso e privacidade</h1>
        <p className="mt-1 mb-4 text-sm text-suave">
          Antes de continuar, leia e aceite os termos abaixo.
        </p>

        <div className="max-h-[50vh] space-y-4 overflow-y-auto rounded-lg border border-borda p-4">
          {termos.isLoading && <Carregando />}
          {termos.data?.secoes.map((secao) => (
            <div key={secao.titulo}>
              <h2 className="text-sm font-bold">{secao.titulo}</h2>
              <div className="mt-1.5 space-y-2">
                {secao.paragrafos.map((paragrafo, indice) => (
                  <p key={indice} className="text-sm text-suave">
                    {paragrafo}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>

        {aceitar.error && (
          <div className="mt-4">
            <Aviso>{mensagemDeErro(aceitar.error)}</Aviso>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => sair.mutate()}>
            Sair
          </Button>
          <Button
            variant="destaque"
            disabled={!termos.data || aceitar.isPending}
            onClick={() => aceitar.mutate()}
          >
            {aceitar.isPending ? "Salvando…" : "Li e aceito"}
          </Button>
        </div>
      </div>
    </div>
  );
}
