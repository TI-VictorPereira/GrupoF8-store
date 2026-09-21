import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ErroApi, api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { Button } from "@/componentes/ui/button";
import { Cabecalho } from "@/componentes/Cabecalho";
import { Carregando } from "@/componentes/Carregando";
import { CodigoBarras } from "@/componentes/CodigoBarras";
import { Moldura } from "@/componentes/Moldura";
import { hora } from "@/comum/formato";
import type { AlmocoDoDia } from "@/interfaces/almoco";

const CHAVE = ["almoco-hoje"] as const;

function useContagem(ate: string | undefined) {
  const [restante, setRestante] = useState("");
  useEffect(() => {
    if (!ate) return;
    const marcar = () => {
      const ms = new Date(ate).getTime() - Date.now();
      if (ms <= 0) return setRestante("expirado");
      const min = Math.floor(ms / 60000);
      const seg = Math.floor((ms % 60000) / 1000);
      setRestante(`${min}:${String(seg).padStart(2, "0")}`);
    };
    marcar();
    const id = setInterval(marcar, 1000);
    return () => clearInterval(id);
  }, [ate]);
  return restante;
}

export function Almoco() {
  const clienteConsulta = useQueryClient();

  const consulta = useQuery({
    queryKey: CHAVE,
    queryFn: () => api.get<AlmocoDoDia | null>("/almocos/meu-hoje"),
    refetchInterval: (query) =>
      query.state.data?.status === "pendente" ? 5000 : false,
  });

  const gerar = useMutation({
    mutationFn: () => api.post<AlmocoDoDia>("/almocos/gerar"),
    onSuccess: (almoco) => clienteConsulta.setQueryData(CHAVE, almoco),
  });

  const almoco = consulta.data ?? null;
  const restante = useContagem(almoco?.status === "pendente" ? almoco.expira_em : undefined);
  const vencido = almoco?.status === "pendente" && restante === "expirado";
  const erro = gerar.error instanceof ErroApi ? gerar.error : null;

  return (
    <Moldura>
      <Cabecalho titulo="Almoço de hoje" />
      <div className="p-5 text-center">
        {consulta.isLoading && <Carregando />}

        {almoco?.status === "confirmado" && (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sucesso/15 text-2xl text-sucesso">
              ✓
            </div>
            <p className="mt-4 text-sm font-semibold text-sucesso">
              Almoço liberado
              {almoco.confirmado_em ? ` às ${hora(almoco.confirmado_em)}` : ""}.
            </p>
            <p className="mt-1 text-xs text-suave">Confirmado no refeitório.</p>
          </>
        )}

        {almoco?.status === "pendente" && !vencido && (
          <>
            <CodigoBarras valor={almoco.codigo_barras} />
            <p className="mt-4 text-xs text-suave">
              Mostre este código ao responsável do refeitório. Expira em{" "}
              <span className="font-bold text-ink">{restante}</span>
            </p>
          </>
        )}

        {(!almoco || almoco.status === "expirado" || almoco.status === "cancelado" || vencido) &&
          !consulta.isLoading && (
            <>
              <p className="text-sm font-bold">
                {almoco && almoco.status !== "cancelado"
                  ? "Código expirado"
                  : "Nenhum código hoje"}
              </p>
              <p className="mt-1 mb-5 text-xs text-suave">
                Gere o código na hora de ir ao refeitório — ele vale por poucos minutos.
              </p>
              {erro && <div className="mb-4">{<Aviso>{erro.message}</Aviso>}</div>}
              <Button
                variant="destaque"
                className="w-full"
                onClick={() => gerar.mutate()}
                disabled={gerar.isPending}
              >
                {gerar.isPending ? "Gerando…" : "Liberar almoço de hoje"}
              </Button>
            </>
          )}
      </div>
    </Moldura>
  );
}
