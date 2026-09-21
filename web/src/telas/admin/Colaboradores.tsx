import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { CampoInteiro } from "@/componentes/CampoInteiro";
import { Carregando } from "@/componentes/Carregando";
import { Vazio } from "@/componentes/Vazio";
import { Badge } from "@/componentes/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/componentes/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/componentes/ui/table";
import { mensagemDeErro } from "@/comum/erros";
import { dataHora } from "@/comum/formato";
import type {
  ColaboradorCompleto,
  ColaboradorCriado,
  Departamento,
  Empresa,
  EntradaColaborador,
  SenhaRedefinida,
  SolicitacaoSenha,
  Vinculo,
} from "@/interfaces/admin";
import type { Papel } from "@/interfaces/sessao";

const CHAVE = ["colaboradores"] as const;
const CHAVE_SOLICITACOES = ["solicitacoes-senha"] as const;

const AVISOS: Record<string, string> = {
  codigo_duplicado: "Já existe alguém com este código.",
  codparc_duplicado: "Este código de parceiro já está em uso.",
  matricula_duplicada: "Já existe esta matrícula nesta empresa.",
  matricula_obrigatoria: "CLT precisa de matrícula.",
  matricula_nao_permitida: "PJ não tem matrícula — deixe o campo vazio.",
  auto_inativacao: "Você não pode desativar o próprio acesso.",
};

const PAPEIS: { valor: Papel; rotulo: string }[] = [
  { valor: "colaborador", rotulo: "Colaborador" },
  { valor: "refeitorio", rotulo: "Refeitório" },
  { valor: "admin", rotulo: "Administrador" },
];

const FORMULARIO_VAZIO = {
  nome_completo: "",
  codigo: "",
  codparc: "",
  empresa_id: "",
  vinculo: "clt" as Vinculo,
  matricula: "",
  papel: "colaborador" as Papel,
  departamento_id: "",
};

export function Colaboradores() {
  const clienteConsulta = useQueryClient();
  const [busca, setBusca] = useState("");
  const [emEdicao, setEmEdicao] = useState<ColaboradorCompleto | null>(null);
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [formulario, setFormulario] = useState(FORMULARIO_VAZIO);
  const [senhaGerada, setSenhaGerada] = useState<SenhaRedefinida | null>(null);

  const colaboradores = useQuery({
    queryKey: [...CHAVE, busca],
    queryFn: () =>
      api.get<ColaboradorCompleto[]>(
        `/colaboradores${busca.trim() ? `?busca=${encodeURIComponent(busca.trim())}` : ""}`,
      ),
  });
  const empresas = useQuery({
    queryKey: ["empresas"],
    queryFn: () => api.get<Empresa[]>("/empresas"),
  });
  const departamentos = useQuery({
    queryKey: ["departamentos"],
    queryFn: () => api.get<Departamento[]>("/departamentos"),
  });
  const solicitacoes = useQuery({
    queryKey: CHAVE_SOLICITACOES,
    queryFn: () => api.get<SolicitacaoSenha[]>("/colaboradores/solicitacoes-senha"),
  });

  function recarregar() {
    void clienteConsulta.invalidateQueries({ queryKey: CHAVE });
  }

  function corpoDoFormulario(): EntradaColaborador {
    return {
      nome_completo: formulario.nome_completo.trim(),
      codigo: formulario.codigo.trim(),
      codparc: Number(formulario.codparc),
      empresa_id: formulario.empresa_id,
      vinculo: formulario.vinculo,
      // PJ não tem matrícula: mandar string vazia viraria 0 e passaria pelo
      // CHECK do banco como se fosse um número válido.
      matricula: formulario.vinculo === "clt" ? Number(formulario.matricula) : null,
      papel: formulario.papel,
      departamento_id: formulario.departamento_id || null,
    };
  }

  // Duas mutações e não uma: criar devolve a senha provisória junto, alterar
  // devolve só o colaborador. Espremer as duas numa só deixava o tipo do
  // retorno mentindo sobre o que vem.
  const criar = useMutation({
    mutationFn: () =>
      api.post<ColaboradorCriado>("/colaboradores", { ...corpoDoFormulario() }),
    onSuccess: (resposta) => {
      recarregar();
      setFormularioAberto(false);
      setSenhaGerada({
        codigo: resposta.colaborador.codigo,
        senha_provisoria: resposta.senha_provisoria,
      });
    },
  });

  const alterar = useMutation({
    mutationFn: () =>
      api.put<ColaboradorCompleto>(`/colaboradores/${emEdicao!.id}`, {
        ...corpoDoFormulario(),
      }),
    onSuccess: () => {
      recarregar();
      setFormularioAberto(false);
    },
  });

  const salvar = emEdicao ? alterar : criar;

  const alternarAtivo = useMutation({
    mutationFn: (pessoa: ColaboradorCompleto) =>
      api.patch(`/colaboradores/${pessoa.id}/ativo`, { ativo: !pessoa.ativo }),
    onSuccess: recarregar,
  });

  const redefinirSenha = useMutation({
    mutationFn: (pessoa: ColaboradorCompleto) =>
      api.post<SenhaRedefinida>(`/colaboradores/${pessoa.id}/senha`),
    onSuccess: (resposta) => {
      recarregar();
      setSenhaGerada(resposta);
    },
  });

  const atenderSolicitacao = useMutation({
    mutationFn: (id: string) =>
      api.post<SenhaRedefinida>(`/colaboradores/solicitacoes-senha/${id}/atender`),
    onSuccess: (resposta) => {
      void clienteConsulta.invalidateQueries({ queryKey: CHAVE_SOLICITACOES });
      setSenhaGerada(resposta);
    },
  });

  const descartarSolicitacao = useMutation({
    mutationFn: (id: string) =>
      api.post(`/colaboradores/solicitacoes-senha/${id}/descartar`),
    onSuccess: () =>
      void clienteConsulta.invalidateQueries({ queryKey: CHAVE_SOLICITACOES }),
  });

  function abrirNovo() {
    setEmEdicao(null);
    setFormulario({ ...FORMULARIO_VAZIO, empresa_id: empresas.data?.[0]?.id ?? "" });
    salvar.reset();
    setFormularioAberto(true);
  }

  function abrirEdicao(pessoa: ColaboradorCompleto) {
    setEmEdicao(pessoa);
    setFormulario({
      nome_completo: pessoa.nome_completo,
      codigo: pessoa.codigo,
      codparc: String(pessoa.codparc),
      empresa_id: pessoa.empresa_id,
      vinculo: pessoa.vinculo,
      matricula: pessoa.matricula === null ? "" : String(pessoa.matricula),
      papel: pessoa.papel,
      departamento_id: pessoa.departamento_id ?? "",
    });
    salvar.reset();
    setFormularioAberto(true);
  }

  const lista = colaboradores.data ?? [];
  const abertas = solicitacoes.data ?? [];
  const erroLista = alternarAtivo.error ?? redefinirSenha.error;

  const podeSalvar =
    formulario.nome_completo.trim() &&
    formulario.codigo.trim() &&
    Number(formulario.codparc) > 0 &&
    formulario.empresa_id &&
    (formulario.vinculo === "pj" || Number(formulario.matricula) > 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">Colaboradores</h1>
        <Button variant="destaque" onClick={abrirNovo} disabled={!empresas.data?.length}>
          Novo colaborador
        </Button>
      </div>

      {abertas.length > 0 && (
        <Card className="mb-4 border-accent">
          <CardContent className="p-4">
            <h2 className="mb-2 text-sm font-bold">
              Pedidos de senha ({abertas.length})
            </h2>
            {abertas.map((pedido) => (
              <div
                key={pedido.id}
                className="flex items-center justify-between gap-3 border-b border-borda py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {pedido.nome_informado ?? "sem nome informado"}
                  </p>
                  <p className="truncate text-[11px] text-suave">
                    código {pedido.codigo} · {dataHora(pedido.criado_em)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="destaque"
                    onClick={() => atenderSolicitacao.mutate(pedido.id)}
                    disabled={atenderSolicitacao.isPending}
                  >
                    Gerar senha
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => descartarSolicitacao.mutate(pedido.id)}
                    disabled={descartarSolicitacao.isPending}
                  >
                    Descartar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome ou código"
        className="mb-3 w-full sm:w-72"
      />

      {erroLista && (
        <div className="mb-4">
          <Aviso>{mensagemDeErro(erroLista, AVISOS)}</Aviso>
        </div>
      )}

      {colaboradores.isLoading && <Carregando />}
      {colaboradores.data && lista.length === 0 && <Vazio>Ninguém encontrado.</Vazio>}

      {lista.length > 0 && (
        <Card className="overflow-x-auto">
          <Table className="tabela-admin">
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Codparc</TableHead>
                <TableHead>Vínculo</TableHead>
                <TableHead>Matrícula</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((pessoa) => (
                <TableRow key={pessoa.id} className={pessoa.ativo ? "" : "opacity-50"}>
                  <TableCell>
                    <p className="text-sm font-semibold">{pessoa.nome_completo}</p>
                    {pessoa.senha_provisoria && (
                      <span className="text-[11px] text-suave">senha provisória pendente</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{pessoa.codigo}</TableCell>
                  <TableCell className="text-sm">{pessoa.codparc}</TableCell>
                  <TableCell className="text-sm uppercase">{pessoa.vinculo}</TableCell>
                  <TableCell className="text-sm">{pessoa.matricula ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={pessoa.papel === "colaborador" ? "secondary" : "default"}>
                      {pessoa.papel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {!pessoa.ativo && <Badge variant="outline">inativo</Badge>}
                      <Button size="sm" variant="ghost" onClick={() => abrirEdicao(pessoa)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => redefinirSenha.mutate(pessoa)}
                        disabled={redefinirSenha.isPending}
                      >
                        Resetar senha
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => alternarAtivo.mutate(pessoa)}
                        disabled={alternarAtivo.isPending}
                      >
                        {pessoa.ativo ? "Desativar" : "Ativar"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* --- cadastro / edição --- */}
      <Dialog open={formularioAberto} onOpenChange={setFormularioAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{emEdicao ? "Editar colaborador" : "Novo colaborador"}</DialogTitle>
            <DialogDescription>
              O codparc é o que identifica a pessoa no Sankhya. A matrícula só existe para CLT
              e se repete entre empresas — é o par com a empresa que é único.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="nome-completo">Nome completo</Label>
              <Input
                id="nome-completo"
                value={formulario.nome_completo}
                onChange={(e) =>
                  setFormulario({ ...formulario, nome_completo: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="codigo-pessoa">Código de acesso</Label>
                <Input
                  id="codigo-pessoa"
                  value={formulario.codigo}
                  onChange={(e) => setFormulario({ ...formulario, codigo: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="codparc">Codparc</Label>
                <CampoInteiro
                  id="codparc"
                  valor={formulario.codparc}
                  aoMudar={(codparc) => setFormulario({ ...formulario, codparc })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="vinculo">Vínculo</Label>
                <Select
                  value={formulario.vinculo}
                  onValueChange={(v) =>
                    setFormulario({
                      ...formulario,
                      vinculo: v as Vinculo,
                      matricula: v === "pj" ? "" : formulario.matricula,
                    })
                  }
                >
                  <SelectTrigger id="vinculo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clt">CLT</SelectItem>
                    <SelectItem value="pj">PJ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="matricula">Matrícula</Label>
                <CampoInteiro
                  id="matricula"
                  valor={formulario.matricula}
                  disabled={formulario.vinculo === "pj"}
                  placeholder={formulario.vinculo === "pj" ? "PJ não tem" : ""}
                  aoMudar={(matricula) => setFormulario({ ...formulario, matricula })}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="empresa">Empresa</Label>
              <Select
                value={formulario.empresa_id}
                onValueChange={(v) => setFormulario({ ...formulario, empresa_id: v })}
              >
                <SelectTrigger id="empresa">
                  <SelectValue placeholder="Escolha a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {(empresas.data ?? []).map((empresa) => (
                    <SelectItem key={empresa.id} value={empresa.id}>
                      {empresa.codemp} — {empresa.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="departamento">Departamento</Label>
                <Select
                  value={formulario.departamento_id || "nenhum"}
                  onValueChange={(v) =>
                    setFormulario({ ...formulario, departamento_id: v === "nenhum" ? "" : v })
                  }
                >
                  <SelectTrigger id="departamento">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Sem departamento</SelectItem>
                    {(departamentos.data ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="papel">Papel</Label>
                <Select
                  value={formulario.papel}
                  onValueChange={(v) => setFormulario({ ...formulario, papel: v as Papel })}
                >
                  <SelectTrigger id="papel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAPEIS.map((p) => (
                      <SelectItem key={p.valor} value={p.valor}>
                        {p.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {salvar.error && <Aviso>{mensagemDeErro(salvar.error, AVISOS)}</Aviso>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormularioAberto(false)}>
              Cancelar
            </Button>
            <Button
              variant="destaque"
              onClick={() => salvar.mutate()}
              disabled={!podeSalvar || salvar.isPending}
            >
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- senha provisória: aparece uma vez só --- */}
      <Dialog open={senhaGerada !== null} onOpenChange={(a) => !a && setSenhaGerada(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Senha provisória gerada</DialogTitle>
            <DialogDescription>
              Anote agora: depois disto só existe o hash, e a única saída é gerar outra. As
              sessões abertas dessa pessoa foram derrubadas.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl bg-ink py-6 text-center">
            <p className="text-[11px] text-white/50">código {senhaGerada?.codigo}</p>
            <p className="mt-1 font-mono text-3xl font-black tracking-widest text-accent">
              {senhaGerada?.senha_provisoria}
            </p>
          </div>

          <DialogFooter>
            <Button variant="destaque" onClick={() => setSenhaGerada(null)}>
              Anotei
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
