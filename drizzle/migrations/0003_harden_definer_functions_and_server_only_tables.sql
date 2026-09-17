-- 1) Restrict EXECUTE on SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.eh_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eh_refeitorio_ou_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.data_utc(timestamp with time zone) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.finalizar_pedido(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancelar_pedido(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gerar_almoco(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirmar_almoco(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_almoco_manual(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ajustar_estoque(uuid, text, integer, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.finalizar_pedido(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_almoco(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_almoco(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_almoco_manual(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque(uuid, text, integer, text) TO authenticated;

-- 2) tentativas_login: server-side (service role) only
REVOKE ALL ON TABLE public.tentativas_login FROM anon, authenticated;
GRANT ALL ON TABLE public.tentativas_login TO service_role;
DROP POLICY IF EXISTS "tentativas_login sem acesso direto" ON public.tentativas_login;
CREATE POLICY "tentativas_login sem acesso direto"
  ON public.tentativas_login FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 3) log_auditoria: admins read only; writes only via service role
REVOKE ALL ON TABLE public.log_auditoria FROM anon, authenticated;
GRANT SELECT ON TABLE public.log_auditoria TO authenticated;
GRANT ALL ON TABLE public.log_auditoria TO service_role;
DROP POLICY IF EXISTS "log_auditoria sem escrita direta" ON public.log_auditoria;
CREATE POLICY "log_auditoria sem escrita direta"
  ON public.log_auditoria FOR INSERT TO anon, authenticated
  WITH CHECK (false);

-- 4) solicitacoes_senha: inserts only through the server function (service role)
REVOKE ALL ON TABLE public.solicitacoes_senha FROM anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.solicitacoes_senha TO authenticated;
GRANT ALL ON TABLE public.solicitacoes_senha TO service_role;
DROP POLICY IF EXISTS "solicitacoes_senha sem insercao direta" ON public.solicitacoes_senha;
CREATE POLICY "solicitacoes_senha sem insercao direta"
  ON public.solicitacoes_senha FOR INSERT TO anon, authenticated
  WITH CHECK (false);
