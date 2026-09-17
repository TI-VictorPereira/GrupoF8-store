import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/f8/Toast";
import {
  criarColaborador,
  importarColaboradores,
  redefinirSenhaColaborador,
} from "@/lib/f8/auth.functions";
import type { Colaborador, Departamento, PapelUsuario } from "@/lib/f8/types";
import { exportarPlanilha } from "@/lib/f8/exportar";
import { horaFmt } from "@/lib/f8/format";

type SolicitacaoSenha = {
  id: string;
  codigo: string;
  nome_informado: string | null;
  criado_em: string;
};

export const Route = createFileRoute("/admin/colaboradores")({
  component: Colaboradores,
});

const PAPEIS: { valor: PapelUsuario; rotulo: string }[] = [
  { valor: "colaborador", rotulo: "Colaborador" },
  { valor: "refeitorio", rotulo: "Refeitório" },
  { valor: "admin", rotulo: "Administrador" },
];

const FORM_VAZIO = {
  nome_completo: "",
  codigo: "",
  senha: "",
  papel: "colaborador" as PapelUsuario,
  departamento_id: "",
  empresa: "Grupo F8",
};

function Colaboradores() {
  const { mostrar } = useToast();
  const [lista, setLista] = useState<Colaborador[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoSenha[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroDep, setFiltroDep] = useState("");
  const [filtroPapel, setFiltroPapel] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const [{ data: perfis }, { data: deps }, { data: pedidos }] = await Promise.all([
      supabase.from("profiles").select("*").order("nome_completo"),
      supabase.from("departamentos").select("*").order("nome"),
      supabase
        .from("solicitacoes_senha")
        .select("id, codigo, nome_informado, criado_em")
        .eq("status", "aberta")
        .order("criado_em", { ascending: false }),
    ]);
    setLista((perfis ?? []) as Colaborador[]);
    setDepartamentos((deps ?? []) as Departamento[]);
    setSolicitacoes((pedidos ?? []) as SolicitacaoSenha[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const nomeDepartamento = useMemo(() => {
    const mapa = new Map(departamentos.map((d) => [d.id, d.nome]));
    return (id: string | null) => (id ? (mapa.get(id) ?? "—") : "—");
  }, [departamentos]);

  async function importarPlanilha(arquivo: File) {
    setImportando(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await arquivo.arrayBuffer();
      const planilha = XLSX.read(buffer, { type: "array" });
      const primeira = planilha.Sheets[planilha.SheetNames[0]!]!;
      const bruto = XLSX.utils.sheet_to_json<Record<string, unknown>>(primeira);

      const linhas = bruto
        .map((l) => {
          const pegar = (...chaves: string[]) => {
            for (const chave of Object.keys(l)) {
              if (chaves.includes(chave.trim().toLowerCase())) return String(l[chave] ?? "").trim();
            }
            return "";
          };
          const papel = pegar("papel", "perfil").toLowerCase();
          return {
            nome_completo: pegar("nome", "nome_completo", "nome completo"),
            codigo: pegar("codigo", "código", "codigo_acesso").replace(/\D/g, ""),
            senha: pegar("senha", "senha_inicial") || "f8mudar",
            papel: (["colaborador", "refeitorio", "admin"].includes(papel)
              ? papel
              : "colaborador") as PapelUsuario,
            departamento: pegar("departamento", "setor"),
            empresa: pegar("empresa") || "Grupo F8",
          };
        })
        .filter((l) => l.nome_completo && l.codigo);

      if (linhas.length === 0) {
        mostrar("Nenhuma linha válida encontrada. Use as colunas Nome e Código.", "danger");
        return;
      }

      const resultado = await importarColaboradores({ data: { linhas } });
      if (!resultado.ok) {
        mostrar("Somente administradores podem importar.", "danger");
        return;
      }
      mostrar(
        `${resultado.criados} cadastrados${resultado.erros.length ? ` · ${resultado.erros.length} com problema` : ""}.`,
        resultado.erros.length ? "danger" : "ok",
      );
      carregar();
    } catch {
      mostrar("Não foi possível ler a planilha.", "danger");
    } finally {
      setImportando(false);
    }
  }

  async function atenderSolicitacao(pedido: SolicitacaoSenha) {
    const perfil = lista.find((c) => c.codigo.toUpperCase() === pedido.codigo.toUpperCase());
    if (!perfil) {
      mostrar("Não existe colaborador com este código.", "danger");
      return;
    }
    const senha = window.prompt(`Nova senha para ${perfil.nome_completo}:`);
    if (!senha || senha.length < 4) return;
    const resultado = await redefinirSenhaColaborador({ data: { id: perfil.id, senha } });
    if (!resultado.ok) {
      mostrar("Não foi possível atualizar a senha.", "danger");
      return;
    }
    await supabase
      .from("solicitacoes_senha")
      .update({ status: "atendida", atendido_em: new Date().toISOString() })
      .eq("id", pedido.id);
    mostrar("Senha atualizada e pedido encerrado.");
    carregar();
  }

  async function cadastrar() {
    if (!form.nome_completo || !form.codigo || form.senha.length < 4) {
      mostrar("Preencha nome, código e uma senha com ao menos 4 caracteres.", "danger");
      return;
    }
    if (!/^\d+$/.test(form.codigo)) {
      mostrar("O código de acesso deve conter apenas números.", "danger");
      return;
    }
    setSalvando(true);
    const resultado = await criarColaborador({
      data: {
        nome_completo: form.nome_completo,
        codigo: form.codigo,
        senha: form.senha,
        papel: form.papel,
        departamento_id: form.departamento_id || null,
        empresa: form.empresa,
      },
    });
    setSalvando(false);

    if (!resultado.ok) {
      mostrar(
        resultado.motivo === "codigo_duplicado"
          ? "Já existe um colaborador com este código."
          : resultado.motivo === "sem_permissao"
            ? "Somente administradores podem cadastrar."
            : "Não foi possível cadastrar.",
        "danger",
      );
      return;
    }
    mostrar("Colaborador cadastrado.");
    setForm(FORM_VAZIO);
    setAberto(false);
    carregar();
  }

  async function alternarAtivo(c: Colaborador) {
    const { error } = await supabase.from("profiles").update({ ativo: !c.ativo }).eq("id", c.id);
    if (error) mostrar(error.message, "danger");
    else carregar();
  }

  async function trocarSenha(c: Colaborador) {
    const senha = window.prompt(`Nova senha para ${c.nome_completo}:`);
    if (!senha || senha.length < 4) return;
    const resultado = await redefinirSenhaColaborador({ data: { id: c.id, senha } });
    mostrar(
      resultado.ok ? "Senha atualizada." : "Não foi possível atualizar a senha.",
      resultado.ok ? "ok" : "danger",
    );
  }

  const visiveis = lista.filter((c) => {
    const termo = busca.trim().toLowerCase();
    const combinaBusca =
      !termo ||
      c.nome_completo.toLowerCase().includes(termo) ||
      c.codigo.toLowerCase().includes(termo);
    const combinaDep = !filtroDep || c.departamento_id === filtroDep;
    const combinaPapel = !filtroPapel || c.papel === filtroPapel;
    const combinaStatus =
      !filtroStatus || (filtroStatus === "ativos" ? c.ativo : !c.ativo);
    const criadoEm = (c.criado_em ?? "").slice(0, 10);
    const combinaData = (!de || criadoEm >= de) && (!ate || criadoEm <= ate);
    return combinaBusca && combinaDep && combinaPapel && combinaStatus && combinaData;
  });

  async function exportar() {
    const linhas = visiveis.map((c) => ({
      Nome: c.nome_completo,
      "Código do colaborador": c.codigo,
      Perfil: c.papel,
      Departamento: nomeDepartamento(c.departamento_id),
      Empresa: c.empresa,
      Status: c.ativo ? "Ativo" : "Inativo",
      "Cadastrado em": horaFmt(c.criado_em),
    }));
    await exportarPlanilha("colaboradores-f8", [{ nome: "Colaboradores", linhas }]);
  }

  return (
    <div>
      {solicitacoes.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 mb-4">
          <h3 className="text-sm font-bold mb-3">Pedidos de nova senha</h3>
          <div className="grid gap-2">
            {solicitacoes.map((pedido) => (
              <div
                key={pedido.id}
                className="flex items-center gap-3 border border-border rounded-lg px-3 py-2"
              >
                <span className="text-sm font-semibold flex-1">{pedido.codigo}</span>
                <button
                  onClick={() => atenderSolicitacao(pedido)}
                  className="text-xs font-semibold bg-accent text-ink rounded-lg px-3 py-1.5"
                >
                  Definir nova senha
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between mb-4 gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou código"
          className="border border-border rounded-lg px-3 py-2 text-sm w-full sm:w-72 bg-card"
        />
        <div className="grid gap-2 grid-cols-2 sm:flex sm:items-center">
          <select
            value={filtroDep}
            onChange={(e) => setFiltroDep(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-card w-full sm:w-auto"
          >
            <option value="">Todos os departamentos</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
          <select
            value={filtroPapel}
            onChange={(e) => setFiltroPapel(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-card w-full sm:w-auto"
          >
            <option value="">Todos os perfis</option>
            <option value="colaborador">Colaborador</option>
            <option value="refeitorio">Refeitório</option>
            <option value="admin">Administrador</option>
          </select>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-card w-full sm:w-auto"
          >
            <option value="">Ativos e inativos</option>
            <option value="ativos">Somente ativos</option>
            <option value="inativos">Somente inativos</option>
          </select>
          <input
            type="date"
            aria-label="Cadastrado a partir de"
            value={de}
            onChange={(e) => setDe(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-card w-full sm:w-auto"
          />
          <input
            type="date"
            aria-label="Cadastrado até"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-card w-full sm:w-auto"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={arquivoRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              e.target.value = "";
              if (arquivo) importarPlanilha(arquivo);
            }}
          />
          <button
            onClick={exportar}
            className="flex-1 sm:flex-none text-xs font-semibold text-ink border border-border rounded-lg px-3 py-2.5"
          >
            Exportar Excel
          </button>
          <button
            onClick={() => arquivoRef.current?.click()}
            disabled={importando}
            className="flex-1 sm:flex-none text-xs font-semibold text-ink border border-border rounded-lg px-3 py-2.5 disabled:opacity-60"
          >
            {importando ? "Importando…" : "Importar planilha"}
          </button>
          <button
            onClick={() => {
              setForm(FORM_VAZIO);
              setAberto(true);
            }}
            className="flex-1 sm:flex-none bg-accent text-ink text-sm font-bold rounded-lg px-4 py-2.5"
          >
            Novo colaborador
          </button>
        </div>
      </div>

      {/* Lista em cartões — celular */}
      <div className="md:hidden flex flex-col gap-3">
        {carregando ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : visiveis.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum colaborador encontrado.
          </p>
        ) : (
          visiveis.map((c) => (
            <div key={c.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{c.nome_completo}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">{c.codigo}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {nomeDepartamento(c.departamento_id)} · {c.empresa}
                  </p>
                </div>
                {c.ativo ? (
                  <span className="text-[11px] font-bold text-success bg-success/10 rounded-full px-2 py-0.5 shrink-0">
                    Ativo
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-danger bg-danger/10 rounded-full px-2 py-0.5 shrink-0">
                    Inativo
                  </span>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => alternarAtivo(c)}
                  className="flex-1 text-xs font-semibold text-ink border border-border rounded-lg px-2.5 py-2"
                >
                  {c.ativo ? "Desativar" : "Ativar"}
                </button>
                <button
                  onClick={() => trocarSenha(c)}
                  className="flex-1 text-xs font-semibold text-ink border border-border rounded-lg px-2.5 py-2"
                >
                  Trocar senha
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Tabela — desktop */}
      <div className="hidden md:block bg-card border border-border rounded-xl p-4 overflow-x-auto">
        <table className="w-full text-sm admin-table">
          <thead>
            <tr className="text-left border-b border-border">
              <th className="py-2 pr-3">Nome completo</th>
              <th className="py-2 pr-3">Código</th>
              <th className="py-2 pr-3">Departamento</th>
              <th className="py-2 pr-3">Empresa</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            ) : visiveis.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  Nenhum colaborador encontrado.
                </td>
              </tr>
            ) : (
              visiveis.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="py-3 pr-3 font-semibold">{c.nome_completo}</td>
                  <td className="py-3 pr-3 font-mono text-xs">{c.codigo}</td>
                  <td className="py-3 pr-3">{nomeDepartamento(c.departamento_id)}</td>
                  <td className="py-3 pr-3">{c.empresa}</td>
                  <td className="py-3 pr-3">
                    {c.ativo ? (
                      <span className="text-[11px] font-bold text-success bg-success/10 rounded-full px-2 py-0.5">
                        Ativo
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-danger bg-danger/10 rounded-full px-2 py-0.5">
                        Inativo
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => alternarAtivo(c)}
                      className="text-xs font-semibold text-ink border border-border rounded-lg px-2.5 py-1.5 mr-1.5"
                    >
                      {c.ativo ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      onClick={() => trocarSenha(c)}
                      className="text-xs font-semibold text-ink border border-border rounded-lg px-2.5 py-1.5"
                    >
                      Trocar senha
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {aberto && (
        <div
          className="fixed inset-0 bg-ink/50 z-40 flex items-center justify-center p-4"
          onClick={() => setAberto(false)}
        >
          <div
            className="bg-card rounded-2xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg mb-4">Novo colaborador</h3>
            <label className="text-xs font-semibold text-muted-foreground">Nome completo</label>
            <input
              value={form.nome_completo}
              onChange={(e) => setForm({ ...form, nome_completo: e.target.value })}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm mt-1 mb-3"
            />
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Código de acesso
                </label>
                <input
                  value={form.codigo}
                  inputMode="numeric"
                  placeholder="Somente números"
                  onChange={(e) =>
                    setForm({ ...form, codigo: e.target.value.replace(/\D/g, "") })
                  }
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Senha inicial</label>
                <input
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Perfil</label>
                <select
                  value={form.papel}
                  onChange={(e) => setForm({ ...form, papel: e.target.value as PapelUsuario })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm mt-1 bg-card"
                >
                  {PAPEIS.map((p) => (
                    <option key={p.valor} value={p.valor}>
                      {p.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Departamento</label>
                <select
                  value={form.departamento_id}
                  onChange={(e) => setForm({ ...form, departamento_id: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm mt-1 bg-card"
                >
                  <option value="">Sem departamento</option>
                  {departamentos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Empresa</label>
                <input
                  value={form.empresa}
                  onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm mt-1"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mb-4">
              Na importação por planilha use as colunas Nome, Código, Senha, Papel, Departamento e
              Empresa. Sem senha na planilha, o acesso é criado com <strong>f8mudar</strong>.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setAberto(false)}
                className="text-sm font-semibold border border-border rounded-lg px-4 py-2.5"
              >
                Cancelar
              </button>
              <button
                onClick={cadastrar}
                disabled={salvando}
                className="text-sm font-bold bg-accent text-ink rounded-lg px-4 py-2.5 disabled:opacity-60"
              >
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
