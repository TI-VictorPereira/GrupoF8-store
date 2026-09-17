ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS matricula text,
  ADD COLUMN IF NOT EXISTS senha_provisoria boolean NOT NULL DEFAULT false;