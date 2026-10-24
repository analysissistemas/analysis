-- Controle de Cabos — schema
-- Papéis: 'admin' (painel, importação, exportação, usuários) e 'campo' (formulário)

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  papel text not null default 'campo' check (papel in ('admin','campo')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.cabos (
  id bigint generated always as identity primary key,
  tag text not null unique,
  disciplina text,
  pavimento text,
  painel text,
  cabo_estimado text,
  de text,
  para text,
  metragem_estimada numeric,
  -- execução (preenchida pelo campo)
  data_corte date,
  metragem_cortada numeric,
  cabo_cortado text,
  data_lancamento date,
  status text generated always as (
    case
      when data_lancamento is not null then 'T'
      when data_corte is not null or metragem_cortada is not null or cabo_cortado is not null then 'P'
      else 'NI'
    end
  ) stored,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.perfis(id) on delete set null
);

create index if not exists cabos_disciplina_idx on public.cabos (disciplina);
create index if not exists cabos_pavimento_idx on public.cabos (pavimento);

-- Histórico de cada preenchimento
create table if not exists public.registros (
  id bigint generated always as identity primary key,
  cabo_id bigint not null references public.cabos(id) on delete cascade,
  usuario_id uuid references public.perfis(id) on delete set null,
  antes jsonb,
  depois jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists registros_cabo_idx on public.registros (cabo_id);
create index if not exists registros_usuario_idx on public.registros (usuario_id, criado_em desc);

create or replace function public.papel_atual() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = auth.uid() and ativo
$$;

alter table public.perfis enable row level security;
alter table public.cabos enable row level security;
alter table public.registros enable row level security;

drop policy if exists perfis_select on public.perfis;
create policy perfis_select on public.perfis for select to authenticated
  using (id = auth.uid() or public.papel_atual() = 'admin');

drop policy if exists cabos_select on public.cabos;
create policy cabos_select on public.cabos for select to authenticated
  using (public.papel_atual() is not null);

drop policy if exists registros_select on public.registros;
create policy registros_select on public.registros for select to authenticated
  using (usuario_id = auth.uid() or public.papel_atual() = 'admin');

-- Escritas só pelas funções abaixo (ou service_role no servidor)
revoke insert, update, delete on public.cabos, public.registros, public.perfis from anon, authenticated;

-- Campo e admin: registrar execução
create or replace function public.registrar_execucao(
  p_cabo_id bigint,
  p_data_corte date,
  p_metragem_cortada numeric,
  p_cabo_cortado text,
  p_data_lancamento date
) returns public.cabos
language plpgsql security definer set search_path = public as $$
declare
  v_antes public.cabos;
  v_depois public.cabos;
begin
  if public.papel_atual() is null then
    raise exception 'Sem permissão';
  end if;
  if p_data_lancamento is not null and p_data_corte is null then
    raise exception 'Informe a data do corte antes da data de lançamento';
  end if;
  if p_data_lancamento is not null and p_data_lancamento < p_data_corte then
    raise exception 'A data de lançamento não pode ser antes da data do corte';
  end if;
  if p_metragem_cortada is not null and p_metragem_cortada < 0 then
    raise exception 'Metragem inválida';
  end if;

  select * into v_antes from public.cabos where id = p_cabo_id for update;
  if not found then raise exception 'Cabo não encontrado'; end if;

  update public.cabos set
    data_corte = p_data_corte,
    metragem_cortada = p_metragem_cortada,
    cabo_cortado = nullif(trim(p_cabo_cortado), ''),
    data_lancamento = p_data_lancamento,
    atualizado_em = now(),
    atualizado_por = auth.uid()
  where id = p_cabo_id
  returning * into v_depois;

  insert into public.registros (cabo_id, usuario_id, antes, depois)
  values (
    p_cabo_id, auth.uid(),
    jsonb_build_object('data_corte', v_antes.data_corte, 'metragem_cortada', v_antes.metragem_cortada,
      'cabo_cortado', v_antes.cabo_cortado, 'data_lancamento', v_antes.data_lancamento, 'status', v_antes.status),
    jsonb_build_object('data_corte', v_depois.data_corte, 'metragem_cortada', v_depois.metragem_cortada,
      'cabo_cortado', v_depois.cabo_cortado, 'data_lancamento', v_depois.data_lancamento, 'status', v_depois.status)
  );
  return v_depois;
end $$;

-- Admin: importar planilha (upsert por TAG)
-- Cadastro sempre atualiza; execução só preenche o que ainda está vazio no sistema
create or replace function public.importar_cabos(p_linhas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_novos int := 0;
  v_atualizados int := 0;
  v_existe boolean;
begin
  if public.papel_atual() is distinct from 'admin' then
    raise exception 'Apenas admin pode importar';
  end if;

  for r in select * from jsonb_array_elements(p_linhas) loop
    select exists(select 1 from public.cabos where tag = r->>'tag') into v_existe;
    insert into public.cabos as c (tag, disciplina, pavimento, painel, cabo_estimado, de, para, metragem_estimada,
      data_corte, metragem_cortada, cabo_cortado, data_lancamento, atualizado_por)
    values (r->>'tag', r->>'disciplina', r->>'pavimento', r->>'painel', r->>'cabo_estimado', r->>'de', r->>'para',
      (r->>'metragem_estimada')::numeric, (r->>'data_corte')::date, (r->>'metragem_cortada')::numeric,
      r->>'cabo_cortado', (r->>'data_lancamento')::date, auth.uid())
    on conflict (tag) do update set
      disciplina = excluded.disciplina,
      pavimento = excluded.pavimento,
      painel = coalesce(excluded.painel, c.painel),
      cabo_estimado = excluded.cabo_estimado,
      de = excluded.de,
      para = excluded.para,
      metragem_estimada = excluded.metragem_estimada,
      data_corte = coalesce(c.data_corte, excluded.data_corte),
      metragem_cortada = coalesce(c.metragem_cortada, excluded.metragem_cortada),
      cabo_cortado = coalesce(c.cabo_cortado, excluded.cabo_cortado),
      data_lancamento = coalesce(c.data_lancamento, excluded.data_lancamento),
      atualizado_em = now();
    if v_existe then v_atualizados := v_atualizados + 1; else v_novos := v_novos + 1; end if;
  end loop;

  return jsonb_build_object('novos', v_novos, 'atualizados', v_atualizados);
end $$;

-- Admin: excluir cabo
create or replace function public.excluir_cabo(p_cabo_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.papel_atual() is distinct from 'admin' then raise exception 'Apenas admin'; end if;
  delete from public.cabos where id = p_cabo_id;
end $$;

revoke execute on function public.registrar_execucao(bigint,date,numeric,text,date) from public, anon;
revoke execute on function public.importar_cabos(jsonb) from public, anon;
revoke execute on function public.excluir_cabo(bigint) from public, anon;
revoke execute on function public.papel_atual() from public, anon;
grant execute on function public.registrar_execucao(bigint,date,numeric,text,date) to authenticated;
grant execute on function public.importar_cabos(jsonb) to authenticated;
grant execute on function public.excluir_cabo(bigint) to authenticated;
grant execute on function public.papel_atual() to authenticated;
