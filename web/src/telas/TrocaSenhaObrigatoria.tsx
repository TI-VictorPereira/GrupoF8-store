import { useState, type FormEvent } from "react";

import { Aviso } from "@/componentes/Aviso";
import { Button } from "@/componentes/ui/button";
import { Input } from "@/componentes/ui/input";
import { Label } from "@/componentes/ui/label";
import { mensagemDeErro } from "@/comum/erros";
import { useTrocarSenha } from "@/comum/sessao";

// Só o que a tela sabe e o servidor não: aqui a "senha atual" é a temporária.
const AVISOS: Record<string, string> = {
  senha_atual_incorreta: "A senha temporária não confere.",
  senha_repetida: "A senha nova precisa ser diferente da temporária.",
};

/**
 * Barreira do primeiro acesso.
 *
 * O servidor também recusa qualquer operação enquanto a senha for provisória —
 * esta tela é conveniência, não o controle de acesso.
 */
export function TrocaSenhaObrigatoria() {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const trocar = useTrocarSenha();

  const naoConfere = confirmacao.length > 0 && nova !== confirmacao;
  const aviso = naoConfere
    ? "As duas senhas não são iguais."
    : trocar.error
      ? mensagemDeErro(trocar.error, AVISOS)
      : null;

  const campos = [
    { id: "atual", rotulo: "Senha temporária", valor: atual, definir: setAtual },
    { id: "nova", rotulo: "Nova senha", valor: nova, definir: setNova },
    {
      id: "confirmacao",
      rotulo: "Repita a nova senha",
      valor: confirmacao,
      definir: setConfirmacao,
    },
  ];

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (naoConfere) return;
    trocar.mutate({ senha_atual: atual, senha_nova: nova });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-bold">Defina sua senha</h1>
        <p className="mt-1 mb-6 text-sm text-suave">
          Você entrou com uma senha temporária. Escolha uma senha sua para continuar.
        </p>

        <form onSubmit={enviar} className="flex flex-col gap-4">
          {campos.map((campo) => (
            <div key={campo.id} className="grid gap-1.5">
              <Label htmlFor={campo.id}>{campo.rotulo}</Label>
              <Input
                id={campo.id}
                type="password"
                value={campo.valor}
                onChange={(e) => campo.definir(e.target.value)}
              />
            </div>
          ))}

          {aviso && <Aviso>{aviso}</Aviso>}

          <Button
            type="submit"
            variant="destaque"
            disabled={trocar.isPending || !atual || !nova || naoConfere}
          >
            {trocar.isPending ? "Salvando…" : "Salvar senha"}
          </Button>
        </form>
      </div>
    </div>
  );
}
