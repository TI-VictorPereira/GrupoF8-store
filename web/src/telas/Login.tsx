import { useState, type FormEvent } from "react";

import { ErroApi, api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { Button } from "@/componentes/ui/button";
import { Input } from "@/componentes/ui/input";
import { Label } from "@/componentes/ui/label";
import { mensagemDeErro } from "@/comum/erros";
import { useEntrar } from "@/comum/sessao";

export function Login() {
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [pedidoEnviado, setPedidoEnviado] = useState(false);
  const entrar = useEntrar();

  // O texto vem do servidor: as respostas de login já são exatamente o que a
  // pessoa precisa ler, e a de credenciais é vaga de propósito.
  const erro = entrar.error instanceof ErroApi ? entrar.error : null;
  const aviso = entrar.error ? mensagemDeErro(entrar.error) : null;

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    entrar.mutate({ codigo: codigo.trim(), senha });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-ink text-lg font-black text-accent">
            F8
          </div>
          <h1 className="text-lg font-bold">Loja Interna</h1>
          <p className="mt-1 text-sm text-suave">Entre com seu código e senha</p>
        </div>

        <form onSubmit={enviar} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="codigo">Código</Label>
            <Input
              id="codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              inputMode="numeric"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {aviso && (
            <Aviso>
              {aviso}
              {erro?.codigo === "erro_interno" && (
                <span className="mt-1 block text-xs font-normal">
                  Código para o suporte: {erro.correlacaoId}
                </span>
              )}
            </Aviso>
          )}

          <Button
            type="submit"
            variant="destaque"
            disabled={entrar.isPending || !codigo || !senha}
          >
            {entrar.isPending ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <div className="mt-6 text-center">
          {pedidoEnviado ? (
            <p className="text-xs text-suave">
              Pedido registrado. Procure o administrador para receber a nova senha.
            </p>
          ) : (
            <Button
              variant="link"
              size="sm"
              className="text-xs text-suave"
              onClick={() => {
                // A tela não pode virar um jeito de descobrir quais códigos
                // existem: o aviso é o mesmo com sucesso, com erro e sem
                // sequer chamar — por isso o resultado é ignorado de propósito.
                if (codigo.trim()) {
                  api.post("/auth/solicitar-senha", { codigo: codigo.trim() }).catch(() => {});
                }
                setPedidoEnviado(true);
              }}
            >
              Esqueci minha senha
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
