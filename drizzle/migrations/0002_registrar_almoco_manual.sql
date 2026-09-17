create or replace function public.registrar_almoco_manual(p_colaborador_id uuid)
returns public.almocos
language plpgsql security definer set search_path = public as $$
declare
  v_existente public.almocos;
  v_novo public.almocos;
  v_codigo text;
begin
  if not public.eh_refeitorio_ou_admin() then
    raise exception 'Sem permissão';
  end if;

  select * into v_existente from public.almocos
  where colaborador_id = p_colaborador_id
    and public.data_utc(criado_em) = public.data_utc(now())
    and status in ('pendente', 'confirmado');

  if found then
    if v_existente.status = 'confirmado' then
      raise exception 'Colaborador já teve o almoço confirmado hoje';
    end if;
    update public.almocos
    set status = 'confirmado', confirmado_em = now(), confirmado_por = auth.uid()
    where id = v_existente.id
    returning * into v_novo;
    return v_novo;
  end if;

  v_codigo := to_char(now(), 'YYYYMMDDHH24MISS') || floor(random() * 90 + 10)::text;

  insert into public.almocos (colaborador_id, codigo_barras, status, origem, expira_em, confirmado_em, confirmado_por)
  values (p_colaborador_id, v_codigo, 'confirmado', 'manual', now() + interval '20 minutes', now(), auth.uid())
  returning * into v_novo;

  return v_novo;
end;
$$;

grant execute on function public.registrar_almoco_manual(uuid) to authenticated;