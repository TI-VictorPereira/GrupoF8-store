import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/cliente";
import { Aviso } from "@/componentes/Aviso";
import { CampoInteiro } from "@/componentes/CampoInteiro";
import { ImportarPlanilha } from "@/componentes/ImportarPlanilha";
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
import { baixarCsv, coluna, normalizar, numeroDaPlanilha } from "@/comum/planilha";
import type {
  ColaboradorCompleto,
  ColaboradorCriado,
  Departamento,
  Empresa,
  EntradaColaborador,
  ResultadoImportacaoColaboradores,
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

  const nomeEmpresa = (id: string) =>
    empresas.data?.find((e) => e.id === id)?.nome ?? "—";
  const nomeDepartamento = (id: string | null) =>
    id ? (departamentos.data?.find((d) => d.id === id)?.nome ?? "—") : "—";

  function exportar() {
    baixarCsv(
      "colaboradores-f8",
      lista.map((p) => ({
        Nome: p.nome_completo,
        Codigo: p.codigo,
        Codparc: p.codparc,
        Matricula: p.matricula ?? "",
        Vinculo: p.vinculo,
        Empresa: nomeEmpresa(p.empresa_id),
        Departamento: nomeDepartamento(p.departamento_id),
        Papel: p.papel,
        Ativo: p.ativo ? "Sim" : "Nao",
      })),
    );
  }

  function converterLinha(linha: Record<string, string>): EntradaColaborador | null {
    const codigo = coluna(linha, "codigo", "codigo de acesso");
    const codemp = Number(numeroDaPlanilha(coluna(linha, "empresa", "codemp")) ?? 0);
    const empresa = empresas.data?.find((e) => e.codemp === codemp);
    if (!codigo || !empresa) return null;

    const matricula = numeroDaPlanilha(coluna(linha, "matricula"));
    const departamento = coluna(linha, "departamento");
    const vinculo = normalizar(coluna(linha, "vinculo")) === "pj" ? "pj" : "clt";

    return {
      nome_completo: coluna(linha, "nome", "nome completo"),
      codigo,
      codparc: Number(numeroDaPlanilha(coluna(linha, "codparc")) ?? 0),
      empresa_id: empresa.id,
      vinculo,
      matricula: vinculo === "clt" && matricula ? Number(matricula) : null,
      papel: (["refeitorio", "admin"].includes(normalizar(coluna(linha, "papel")))
        ? normalizar(coluna(linha, "papel"))
        : "colaborador") as Papel,
      departamento_id:
        departamentos.data?.find(
          (d) => normalizar(d.nome) === normalizar(departamento),
        )?.id ?? null,
    };
  }
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
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={exportar} disabled={lista.length === 0}>
            Exportar
          </Button>
          <ImportarPlanilha
            titulo="Importar colaboradores"
            descricao={
              "Cria quem ainda não existe. Cada um recebe uma senha provisória, " +
              "mostrada no fim. CLT precisa de matrícula; PJ, não."
            }
            nomeDoModelo="modelo-colaboradores-f8"
            modelo={{
              Nome: "Fulano de Tal",
              Codigo: "1234",
              Codparc: 5678,
              Matricula: 1234,
              Vinculo: "clt",
              Empresa: empresas.data?.[0]?.codemp ?? 1,
              Departamento: departamentos.data?.[0]?.nome ?? "",
              Papel: "colaborador",
            }}
            converter={converterLinha}
            enviar={(linhas) =>
              api.post<ResultadoImportacaoColaboradores>("/colaboradores/importar", { linhas })
            }
            aoConcluir={recarregar}
            extraNoResultado={(resultado) =>
              Object.keys(resultado.senhas).length > 0 && (
                <div className="rounded-lg border border-accent bg-accent/10 p-3">
                  <p className="text-sm font-semibold">
                    {Object.keys(resultado.senhas).length} senha(s) provisória(s) geradas
                  </p>
                  {/* Aparecem uma vez só: depois disto existe apenas o hash, e
                      a saída é redefinir uma a uma. Baixar é o único jeito
                      prático de entregar 100 senhas. */}
                  <p className="mt-0.5 mb-2 text-[11px] text-suave">
                    Baixe agora — elas não aparecem de novo.
                  </p>
                  <Button
                    size="sm"
                    variant="destaque"
                    onClick={() =>
                      baixarCsv(
                        "senhas-provisorias-f8",
                        Object.entries(resultado.senhas).map(([codigo, senha]) => ({
                          Codigo: codigo,
                          "Senha provisoria": senha,
                        })),
                      )
                    }
                  >
                    Baixar senhas
                  </Button>
                </div>
              )
            }
          />
          <Button variant="destaque" onClick={abrirNovo} disabled={!empresas.data?.length}>
            Novo colaborador
          </Button>
        </div>
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
