-- Cadastro manual de cabos pelo admin (sem planilha) e edição do cadastro

-- Cria um cabo novo; recusa TAG repetida em vez de sobrescrever
create or replace function public.criar_cabo(p jsonb) returns public.cabos
language plpgsql security definer set search_path = public as $$
declare
  v_tag text := upper(trim(p->>'tag'));
  v_novo public.cabos;
begin
  if public.papel_atual() is distinct from 'admin' then raise exception 'Apenas admin'; end if;
  if v_tag is null or v_tag = '' then raise exception 'Informe a TAG do cabo'; end if;
  if exists (select 1 from public.cabos where upper(tag) = v_tag) then
    raise exception 'Já existe um cabo com a TAG %', v_tag;
  end if;
  insert into public.cabos (tag, disciplina, pavimento, painel, cabo_estimado, de, para, metragem_estimada, atualizado_por)
  values (
    v_tag,
    nullif(trim(p->>'disciplina'), ''),
    nullif(trim(p->>'pavimento'), ''),
    nullif(trim(p->>'painel'), ''),
    nullif(trim(p->>'cabo_estimado'), ''),
    nullif(trim(p->>'de'), ''),
    nullif(trim(p->>'para'), ''),
    nullif(p->>'metragem_estimada', '')::numeric,
    auth.uid()
  )
  returning * into v_novo;
  return v_novo;
end $$;

-- Edita os dados do cadastro (não mexe na execução preenchida pelo campo)
create or replace function public.atualizar_cadastro(p_cabo_id bigint, p jsonb) returns public.cabos
language plpgsql security definer set search_path = public as $$
declare
  v_tag text := upper(trim(p->>'tag'));
  v_cabo public.cabos;
begin
  if public.papel_atual() is distinct from 'admin' then raise exception 'Apenas admin'; end if;
  if v_tag is null or v_tag = '' then raise exception 'Informe a TAG do cabo'; end if;
  if exists (select 1 from public.cabos where upper(tag) = v_tag and id <> p_cabo_id) then
    raise exception 'Já existe outro cabo com a TAG %', v_tag;
  end if;
  update public.cabos set
    tag = v_tag,
    disciplina = nullif(trim(p->>'disciplina'), ''),
    pavimento = nullif(trim(p->>'pavimento'), ''),
    painel = nullif(trim(p->>'painel'), ''),
    cabo_estimado = nullif(trim(p->>'cabo_estimado'), ''),
    de = nullif(trim(p->>'de'), ''),
    para = nullif(trim(p->>'para'), ''),
    metragem_estimada = nullif(p->>'metragem_estimada', '')::numeric,
    atualizado_em = now(),
    atualizado_por = auth.uid()
  where id = p_cabo_id
  returning * into v_cabo;
  if not found then raise exception 'Cabo não encontrado'; end if;
  return v_cabo;
end $$;

revoke execute on function public.criar_cabo(jsonb) from public, anon;
revoke execute on function public.atualizar_cadastro(bigint, jsonb) from public, anon;
grant execute on function public.criar_cabo(jsonb) to authenticated;
grant execute on function public.atualizar_cadastro(bigint, jsonb) to authenticated;
