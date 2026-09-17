CREATE TABLE public.solicitacoes_senha (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL,
  nome_informado TEXT,
  status TEXT NOT NULL DEFAULT 'aberta',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atendido_em TIMESTAMPTZ,
  atendido_por UUID REFERENCES public.profiles(id)
);

CREATE INDEX idx_solicitacoes_senha_status ON public.solicitacoes_senha (status, criado_em DESC);

GRANT SELECT, INSERT, UPDATE ON public.solicitacoes_senha TO authenticated;
GRANT ALL ON public.solicitacoes_senha TO service_role;

ALTER TABLE public.solicitacoes_senha ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin le solicitacoes" ON public.solicitacoes_senha
  FOR SELECT TO authenticated USING (public.eh_admin());

CREATE POLICY "admin atualiza solicitacoes" ON public.solicitacoes_senha
  FOR UPDATE TO authenticated USING (public.eh_admin()) WITH CHECK (public.eh_admin());