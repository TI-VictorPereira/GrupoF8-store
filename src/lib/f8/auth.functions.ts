import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_TENTATIVAS = 5;
const BLOQUEIO_MINUTOS = 2;

function emailSintetico(codigo: string) {
  return `${codigo.toLowerCase()}@lojaf8.internal`;
}

export type ResultadoLogin =
  | { ok: true; access_token: string; refresh_token: string; papel: string }
  | { ok: false; motivo: "bloqueado" | "inativo" | "invalido" | "campos_obrigatorios" };

/**
 * Login único por código + senha. O bloqueio por tentativas e a checagem de
 * perfil ativo acontecem no servidor — nunca no relógio/estado do dispositivo.
 */
export const loginPorCodigo = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ codigo: z.string().min(1), senha: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }): Promise<ResultadoLogin> => {
    const { createClient } = await import("@supabase/supabase-js");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const codigo = data.codigo.trim();

    const { data: tentativa } = await supabaseAdmin
      .from("tentativas_login")
      .select("*")
      .eq("codigo", codigo)
      .maybeSingle();

    if (tentativa?.bloqueado_ate && new Date(tentativa.bloqueado_ate) > new Date()) {
      return { ok: false, motivo: "bloqueado" };
    }

    const anon = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: authData, error: authError } = await anon.auth.signInWithPassword({
      email: emailSintetico(codigo),
      password: data.senha,
    });

    if (authError || !authData?.session) {
      const novasTentativas = (tentativa?.tentativas ?? 0) + 1;
      await supabaseAdmin.from("tentativas_login").upsert({
        codigo,
        tentativas: novasTentativas,
        bloqueado_ate:
          novasTentativas >= MAX_TENTATIVAS
            ? new Date(Date.now() + BLOQUEIO_MINUTOS * 60_000).toISOString()
            : null,
      });
      return { ok: false, motivo: "invalido" };
    }

    await supabaseAdmin
      .from("tentativas_login")
      .upsert({ codigo, tentativas: 0, bloqueado_ate: null });

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("papel, ativo")
      .eq("id", authData.user!.id)
      .maybeSingle();

    if (!profile || profile.ativo === false) {
      return { ok: false, motivo: "inativo" };
    }

    return {
      ok: true,
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      papel: profile.papel,
    };
  });

/** Troca da própria senha (obrigatória no primeiro acesso). */
export const trocarSenhaPropria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ senha: z.string().min(6).max(72) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.senha,
    });
    if (error) return { ok: false as const, motivo: error.message };
    await supabaseAdmin
      .from("profiles")
      .update({ senha_provisoria: false })
      .eq("id", context.userId);
    return { ok: true as const };
  });

/** Cadastro de colaborador/refeitório — só administradores. */
export const criarColaborador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        nome_completo: z.string().min(1),
        codigo: z.string().regex(/^\d+$/, "O código deve conter apenas números"),
        senha: z.string().min(4),
        papel: z.enum(["colaborador", "refeitorio", "admin"]).default("colaborador"),
        departamento_id: z.string().uuid().nullable().optional(),
        empresa: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: chamador } = await context.supabase
      .from("profiles")
      .select("papel")
      .eq("id", context.userId)
      .maybeSingle();

    if (chamador?.papel !== "admin") {
      return { ok: false as const, motivo: "sem_permissao" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existente } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("codigo", data.codigo)
      .maybeSingle();
    if (existente) return { ok: false as const, motivo: "codigo_duplicado" };

    const { data: novoUsuario, error: criarUsuarioError } =
      await supabaseAdmin.auth.admin.createUser({
        email: emailSintetico(data.codigo),
        password: data.senha,
        email_confirm: true,
      });

    if (criarUsuarioError || !novoUsuario?.user) {
      return { ok: false as const, motivo: criarUsuarioError?.message ?? "erro_criar_usuario" };
    }

    const { error: perfilError } = await supabaseAdmin.from("profiles").insert({
      id: novoUsuario.user.id,
      papel: data.papel,
      nome_completo: data.nome_completo,
      codigo: data.codigo,
      departamento_id: data.departamento_id ?? null,
      empresa: data.empresa ?? "Grupo F8",
      ativo: true,
    });

    if (perfilError) {
      await supabaseAdmin.auth.admin.deleteUser(novoUsuario.user.id);
      return { ok: false as const, motivo: perfilError.message };
    }

    return { ok: true as const };
  });

/** Troca de senha de um colaborador — só administradores. */
export const redefinirSenhaColaborador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), senha: z.string().min(4) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: chamador } = await context.supabase
      .from("profiles")
      .select("papel")
      .eq("id", context.userId)
      .maybeSingle();

    if (chamador?.papel !== "admin") {
      return { ok: false as const, motivo: "sem_permissao" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      password: data.senha,
    });
    if (error) return { ok: false as const, motivo: error.message };
    return { ok: true as const };
  });

/** Colaborador pede uma nova senha na tela de login (o admin atende). */
export const solicitarNovaSenha = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({ codigo: z.string().min(1).max(40), nome_informado: z.string().max(120).optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const codigo = data.codigo.trim().toUpperCase();

    const { data: existente } = await supabaseAdmin
      .from("solicitacoes_senha")
      .select("id")
      .eq("codigo", codigo)
      .eq("status", "aberta")
      .maybeSingle();

    if (!existente) {
      await supabaseAdmin.from("solicitacoes_senha").insert({
        codigo,
        nome_informado: data.nome_informado?.trim() || null,
      });
    }
    // Resposta sempre igual, para não revelar quais códigos existem.
    return { ok: true as const };
  });

/** Importação de colaboradores em massa (planilha) — só administradores. */
export const importarColaboradores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        linhas: z
          .array(
            z.object({
              nome_completo: z.string().min(1),
              codigo: z.string().regex(/^\d+$/, "O código deve conter apenas números"),
              senha: z.string().min(4),
              papel: z.enum(["colaborador", "refeitorio", "admin"]).default("colaborador"),
              departamento: z.string().optional(),
              empresa: z.string().optional(),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: chamador } = await context.supabase
      .from("profiles")
      .select("papel")
      .eq("id", context.userId)
      .maybeSingle();
    if (chamador?.papel !== "admin") {
      return { ok: false as const, motivo: "sem_permissao", criados: 0, erros: [] as string[] };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: deps } = await supabaseAdmin.from("departamentos").select("id, nome");
    const mapaDep = new Map((deps ?? []).map((d) => [d.nome.trim().toLowerCase(), d.id]));

    let criados = 0;
    const erros: string[] = [];

    for (const linha of data.linhas) {
      const codigo = linha.codigo.trim().toUpperCase();
      const { data: jaExiste } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("codigo", codigo)
        .maybeSingle();
      if (jaExiste) {
        erros.push(`${codigo}: já cadastrado`);
        continue;
      }

      const { data: novo, error: erroUsuario } = await supabaseAdmin.auth.admin.createUser({
        email: emailSintetico(codigo),
        password: linha.senha,
        email_confirm: true,
      });
      if (erroUsuario || !novo?.user) {
        erros.push(`${codigo}: ${erroUsuario?.message ?? "falha ao criar acesso"}`);
        continue;
      }

      const { error: erroPerfil } = await supabaseAdmin.from("profiles").insert({
        id: novo.user.id,
        papel: linha.papel,
        nome_completo: linha.nome_completo.trim(),
        codigo,
        departamento_id: linha.departamento
          ? (mapaDep.get(linha.departamento.trim().toLowerCase()) ?? null)
          : null,
        empresa: linha.empresa?.trim() || "Grupo F8",
        ativo: true,
      });
      if (erroPerfil) {
        await supabaseAdmin.auth.admin.deleteUser(novo.user.id);
        erros.push(`${codigo}: ${erroPerfil.message}`);
        continue;
      }
      criados += 1;
    }

    return { ok: true as const, criados, erros };
  });
