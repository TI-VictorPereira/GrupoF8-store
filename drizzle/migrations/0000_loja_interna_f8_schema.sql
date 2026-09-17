create extension if not exists "uuid-ossp";

do $$ begin
  create type papel_usuario as enum ('colaborador', 'refeitorio', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pedido_status as enum ('pendente', 'entregue', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type almoco_status as enum ('pendente', 'confirmado', 'expirado', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type almoco_origem as enum ('totem', 'manual');
exception when duplicate_object then null; end $$;

create table if not exists public.departamentos (
  id uuid primary key default uuid_generate_v4(),
  nome text not null unique
);
grant select on public.departamentos to authenticated;
grant all on public.departamentos to service_role;

create table if not exists public.categorias_produto (
  id uuid primary key default uuid_generate_v4(),
  nome text not null unique
);
grant select on public.categorias_produto to authenticated;
grant all on public.categorias_produto to service_role;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  papel papel_usuario not null,
  nome_completo text not null,
  codigo text not null unique,
  departamento_id uuid references public.departamentos(id),
  empresa text not null default 'Grupo F8',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists profiles_codigo_idx on public.profiles (codigo);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;

create table if not exists public.produtos (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  codigo text not null unique,
  categoria_id uuid references public.categorias_produto(id),
  custo numeric(10,2) not null default 0,
  preco_venda numeric(10,2) not null default 0,
  estoque integer not null default 0 check (estoque >= 0),
  foto_url text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.produtos to authenticated;
grant all on public.produtos to service_role;

create table if not exists public.pedidos (
  id uuid primary key default uuid_generate_v4(),
  colaborador_id uuid not null references public.profiles(id),
  valor_total numeric(10,2) not null default 0,
  status pedido_status not null default 'pendente',
  codigo_retirada text not null,
  criado_em timestamptz not null default now(),
  entregue_em timestamptz,
  entregue_por uuid references public.profiles(id),
  cancelado_em timestamptz,
  motivo_cancelamento text
);
create unique index if not exists pedidos_codigo_retirada_pendente_uk
  on public.pedidos (codigo_retirada) where status = 'pendente';
grant select, insert, update, delete on public.pedidos to authenticated;
grant all on public.pedidos to service_role;

create table if not exists public.itens_pedido (
  id uuid primary key default uuid_generate_v4(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  produto_id uuid references public.produtos(id) on delete set null,
  nome_produto text not null,
  categoria text,
  quantidade integer not null check (quantidade > 0),
  preco_unitario numeric(10,2) not null,
  custo_unitario numeric(10,2) not null
);
grant select, insert, update, delete on public.itens_pedido to authenticated;
grant all on public.itens_pedido to service_role;

create or replace function public.data_utc(p_ts timestamptz) returns date
language sql immutable as $$
  select (p_ts at time zone 'utc')::date;
$$;

create table if not exists public.almocos (
  id uuid primary key default uuid_generate_v4(),
  colaborador_id uuid not null references public.profiles(id),
  codigo_barras text not null unique,
  status almoco_status not null default 'pendente',
  origem almoco_origem not null default 'totem',
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  confirmado_em timestamptz,
  confirmado_por uuid references public.profiles(id)
);
create unique index if not exists almocos_um_por_dia
  on public.almocos (colaborador_id, public.data_utc(criado_em))
  where status in ('pendente', 'confirmado');
grant select, insert, update, delete on public.almocos to authenticated;
grant all on public.almocos to service_role;

create table if not exists public.ajustes_estoque (
  id uuid primary key default uuid_generate_v4(),
  produto_id uuid not null references public.produtos(id),
  tipo text not null check (tipo in ('entrada', 'baixa')),
  quantidade integer not null check (quantidade > 0),
  motivo text not null,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);
grant select on public.ajustes_estoque to authenticated;
grant all on public.ajustes_estoque to service_role;

create table if not exists public.log_auditoria (
  id uuid primary key default uuid_generate_v4(),
  entidade text not null,
  entidade_id uuid,
  acao text not null,
  usuario_id uuid references public.profiles(id),
  dados_anteriores jsonb,
  dados_novos jsonb,
  criado_em timestamptz not null default now()
);
grant select on public.log_auditoria to authenticated;
grant all on public.log_auditoria to service_role;

create table if not exists public.tentativas_login (
  codigo text primary key,
  tentativas integer not null default 0,
  bloqueado_ate timestamptz
);
grant all on public.tentativas_login to service_role;

-- ---------- helpers de papel (security definer para evitar recursão de RLS) ----------
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and papel = 'admin' and ativo);
$$;

create or replace function public.eh_refeitorio_ou_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and papel in ('refeitorio', 'admin') and ativo);
$$;

-- ---------- funções atômicas ----------
create or replace function public.finalizar_pedido(p_itens jsonb)
returns public.pedidos
language plpgsql security definer set search_path = public as $$
declare
  v_colaborador_id uuid := auth.uid();
  v_pedido public.pedidos;
  v_item jsonb;
  v_produto public.produtos;
  v_total numeric(10,2) := 0;
  v_codigo text;
  v_tentativas int := 0;
begin
  if v_colaborador_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  loop
    v_codigo := lpad(floor(random() * 900 + 100)::text, 3, '0');
    exit when not exists (
      select 1 from public.pedidos where codigo_retirada = v_codigo and status = 'pendente'
    );
    v_tentativas := v_tentativas + 1;
    if v_tentativas > 50 then
      raise exception 'Não foi possível gerar um código de retirada único';
    end if;
  end loop;

  insert into public.pedidos (colaborador_id, valor_total, status, codigo_retirada)
  values (v_colaborador_id, 0, 'pendente', v_codigo)
  returning * into v_pedido;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    select * into v_produto from public.produtos where id = (v_item->>'produto_id')::uuid for update;
    if not found or v_produto.ativo = false then
      raise exception 'Produto indisponível: %', (v_item->>'produto_id');
    end if;
    if v_produto.estoque < (v_item->>'quantidade')::int then
      raise exception 'Estoque insuficiente para %', v_produto.nome;
    end if;

    update public.produtos set estoque = estoque - (v_item->>'quantidade')::int where id = v_produto.id;

    insert into public.itens_pedido (pedido_id, produto_id, nome_produto, categoria, quantidade, preco_unitario, custo_unitario)
    values (v_pedido.id, v_produto.id, v_produto.nome,
            (select nome from public.categorias_produto where id = v_produto.categoria_id),
            (v_item->>'quantidade')::int, v_produto.preco_venda, v_produto.custo);

    v_total := v_total + v_produto.preco_venda * (v_item->>'quantidade')::int;
  end loop;

  update public.pedidos set valor_total = v_total where id = v_pedido.id returning * into v_pedido;
  return v_pedido;
end;
$$;

create or replace function public.cancelar_pedido(p_pedido_id uuid, p_motivo text)
returns public.pedidos
language plpgsql security definer set search_path = public as $$
declare
  v_pedido public.pedidos;
  v_item public.itens_pedido;
begin
  if not public.eh_refeitorio_ou_admin() then
    raise exception 'Sem permissão';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found or v_pedido.status <> 'pendente' then
    raise exception 'Pedido não encontrado ou não está mais pendente';
  end if;

  for v_item in select * from public.itens_pedido where pedido_id = p_pedido_id loop
    if v_item.produto_id is not null then
      update public.produtos set estoque = estoque + v_item.quantidade where id = v_item.produto_id;
    end if;
  end loop;

  update public.pedidos set status = 'cancelado', cancelado_em = now(), motivo_cancelamento = p_motivo
  where id = p_pedido_id returning * into v_pedido;
  return v_pedido;
end;
$$;

create or replace function public.gerar_almoco(p_validade_minutos int default 20)
returns public.almocos
language plpgsql security definer set search_path = public as $$
declare
  v_colaborador_id uuid := auth.uid();
  v_existente public.almocos;
  v_novo public.almocos;
  v_codigo text;
begin
  if v_colaborador_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  select * into v_existente from public.almocos
  where colaborador_id = v_colaborador_id
    and public.data_utc(criado_em) = public.data_utc(now())
    and status in ('pendente', 'confirmado');

  if found then
    return v_existente;
  end if;

  v_codigo := to_char(now(), 'YYYYMMDDHH24MISS') || floor(random() * 90 + 10)::text;

  insert into public.almocos (colaborador_id, codigo_barras, status, origem, expira_em)
  values (v_colaborador_id, v_codigo, 'pendente', 'totem', now() + make_interval(mins => p_validade_minutos))
  returning * into v_novo;

  return v_novo;
end;
$$;

create or replace function public.confirmar_almoco(p_codigo_barras text)
returns public.almocos
language plpgsql security definer set search_path = public as $$
declare
  v_confirmado_por uuid := auth.uid();
  v_almoco public.almocos;
begin
  if not public.eh_refeitorio_ou_admin() then
    raise exception 'Sem permissão';
  end if;

  update public.almocos
  set status = 'confirmado', confirmado_em = now(), confirmado_por = v_confirmado_por
  where codigo_barras = p_codigo_barras
    and status = 'pendente'
    and expira_em > now()
  returning * into v_almoco;

  if not found then
    raise exception 'Código não encontrado, já usado ou expirado';
  end if;

  return v_almoco;
end;
$$;

create or replace function public.ajustar_estoque(p_produto_id uuid, p_tipo text, p_quantidade int, p_motivo text)
returns public.produtos
language plpgsql security definer set search_path = public as $$
declare
  v_produto public.produtos;
begin
  if not public.eh_admin() then
    raise exception 'Sem permissão';
  end if;
  if p_tipo not in ('entrada', 'baixa') then
    raise exception 'Tipo de ajuste inválido';
  end if;

  select * into v_produto from public.produtos where id = p_produto_id for update;
  if not found then
    raise exception 'Produto não encontrado';
  end if;

  if p_tipo = 'entrada' then
    update public.produtos set estoque = estoque + p_quantidade where id = p_produto_id returning * into v_produto;
  else
    update public.produtos set estoque = greatest(0, estoque - p_quantidade) where id = p_produto_id returning * into v_produto;
  end if;

  insert into public.ajustes_estoque (produto_id, tipo, quantidade, motivo, criado_por)
  values (p_produto_id, p_tipo, p_quantidade, p_motivo, auth.uid());

  return v_produto;
end;
$$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.produtos enable row level security;
alter table public.pedidos enable row level security;
alter table public.itens_pedido enable row level security;
alter table public.almocos enable row level security;
alter table public.ajustes_estoque enable row level security;
alter table public.log_auditoria enable row level security;
alter table public.departamentos enable row level security;
alter table public.categorias_produto enable row level security;
alter table public.tentativas_login enable row level security;

create policy profiles_select_proprio on public.profiles for select to authenticated using (id = auth.uid() or public.eh_admin());
create policy profiles_admin_all on public.profiles for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

create policy produtos_select on public.produtos for select to authenticated using (true);
create policy produtos_admin_write on public.produtos for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

create policy departamentos_select on public.departamentos for select to authenticated using (true);
create policy departamentos_admin_write on public.departamentos for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy categorias_select on public.categorias_produto for select to authenticated using (true);
create policy categorias_admin_write on public.categorias_produto for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

create policy pedidos_select_proprio on public.pedidos for select to authenticated using (colaborador_id = auth.uid() or public.eh_refeitorio_ou_admin());
create policy pedidos_update_staff on public.pedidos for update to authenticated using (public.eh_refeitorio_ou_admin()) with check (public.eh_refeitorio_ou_admin());

create policy itens_pedido_select on public.itens_pedido for select to authenticated using (
  exists (select 1 from public.pedidos p where p.id = pedido_id and (p.colaborador_id = auth.uid() or public.eh_refeitorio_ou_admin()))
);

create policy almocos_select_proprio on public.almocos for select to authenticated using (colaborador_id = auth.uid() or public.eh_refeitorio_ou_admin());
create policy almocos_update_proprio on public.almocos for update to authenticated using (colaborador_id = auth.uid() or public.eh_refeitorio_ou_admin()) with check (colaborador_id = auth.uid() or public.eh_refeitorio_ou_admin());

create policy ajustes_estoque_admin on public.ajustes_estoque for select to authenticated using (public.eh_admin());
create policy log_auditoria_admin on public.log_auditoria for select to authenticated using (public.eh_admin());

-- ---------- realtime ----------
alter table public.almocos replica identity full;
alter table public.pedidos replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.almocos;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.pedidos;
exception when duplicate_object then null; end $$;