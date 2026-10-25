-- Histórico completo: registra todas as ações e não é apagado quando o cabo é excluído

alter table public.registros
  add column if not exists acao text not null default 'preenchimento',
  add column if not exists tag text,
  add column if not exists de text,
  add column if not exists para text,
  add column if not exists detalhe text;

alter table public.registros drop constraint if exists registros_acao_check;
alter table public.registros add constraint registros_acao_check
  check (acao in ('preenchimento', 'cabo_criado', 'cadastro_editado', 'cabo_excluido', 'importacao'));

-- Guarda TAG/DE/PARA no próprio registro (legível mesmo depois de excluir o cabo)
update public.registros r set tag = c.tag, de = c.de, para = c.para
from public.cabos c where c.id = r.cabo_id and r.tag is null;

-- Excluir o cabo não apaga mais o histórico dele
alter table public.registros alter column cabo_id drop not null;
alter table public.registros drop constraint if exists registros_cabo_id_fkey;
alter table public.registros add constraint registros_cabo_id_fkey
  foreign key (cabo_id) references public.cabos(id) on delete set null;

create index if not exists registros_criado_idx on public.registros (criado_em desc);

-- Retratos usados no histórico
create or replace function public.execucao_json(c public.cabos) returns jsonb
language sql immutable as $$
  select jsonb_build_object('data_corte', c.data_corte, 'metragem_cortada', c.metragem_cortada,
    'cabo_cortado', c.cabo_cortado, 'data_lancamento', c.data_lancamento, 'status', c.status)
$$;

create or replace function public.cadastro_json(c public.cabos) returns jsonb
language sql immutable as $$
  select jsonb_build_object('tag', c.tag, 'de', c.de, 'para', c.para, 'disciplina', c.disciplina,
    'pavimento', c.pavimento, 'painel', c.painel, 'cabo_estimado', c.cabo_estimado,
    'metragem_estimada', c.metragem_estimada, 'status', c.status)
$$;

-- Preenchimento (campo e admin)
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

  insert into public.registros (cabo_id, usuario_id, acao, tag, de, para, antes, depois)
  values (p_cabo_id, auth.uid(), 'preenchimento', v_depois.tag, v_depois.de, v_depois.para,
    public.execucao_json(v_antes), public.execucao_json(v_depois));
  return v_depois;
end $$;

-- Cadastro manual
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

  insert into public.registros (cabo_id, usuario_id, acao, tag, de, para, depois)
  values (v_novo.id, auth.uid(), 'cabo_criado', v_novo.tag, v_novo.de, v_novo.para, public.cadastro_json(v_novo));
  return v_novo;
end $$;

-- Edição do cadastro
create or replace function public.atualizar_cadastro(p_cabo_id bigint, p jsonb) returns public.cabos
language plpgsql security definer set search_path = public as $$
declare
  v_tag text := upper(trim(p->>'tag'));
  v_antes public.cabos;
  v_cabo public.cabos;
begin
  if public.papel_atual() is distinct from 'admin' then raise exception 'Apenas admin'; end if;
  if v_tag is null or v_tag = '' then raise exception 'Informe a TAG do cabo'; end if;
  if exists (select 1 from public.cabos where upper(tag) = v_tag and id <> p_cabo_id) then
    raise exception 'Já existe outro cabo com a TAG %', v_tag;
  end if;
  select * into v_antes from public.cabos where id = p_cabo_id for update;
  if not found then raise exception 'Cabo não encontrado'; end if;

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

  insert into public.registros (cabo_id, usuario_id, acao, tag, de, para, antes, depois)
  values (p_cabo_id, auth.uid(), 'cadastro_editado', v_cabo.tag, v_cabo.de, v_cabo.para,
    public.cadastro_json(v_antes), public.cadastro_json(v_cabo));
  return v_cabo;
end $$;

-- Exclusão: registra antes de apagar (o registro fica, com cabo_id nulo)
create or replace function public.excluir_cabo(p_cabo_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cabo public.cabos;
begin
  if public.papel_atual() is distinct from 'admin' then raise exception 'Apenas admin'; end if;
  select * into v_cabo from public.cabos where id = p_cabo_id;
  if not found then raise exception 'Cabo não encontrado'; end if;
  insert into public.registros (cabo_id, usuario_id, acao, tag, de, para, antes)
  values (p_cabo_id, auth.uid(), 'cabo_excluido', v_cabo.tag, v_cabo.de, v_cabo.para,
    public.cadastro_json(v_cabo) || public.execucao_json(v_cabo));
  delete from public.cabos where id = p_cabo_id;
end $$;

-- Importação: uma linha no histórico por lote importado
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

  if v_novos + v_atualizados > 0 then
    insert into public.registros (usuario_id, acao, detalhe, depois)
    values (auth.uid(), 'importacao',
      format('Planilha importada: %s novos, %s atualizados', v_novos, v_atualizados),
      jsonb_build_object('novos', v_novos, 'atualizados', v_atualizados));
  end if;

  return jsonb_build_object('novos', v_novos, 'atualizados', v_atualizados);
end $$;

revoke execute on function public.execucao_json(public.cabos) from public, anon;
revoke execute on function public.cadastro_json(public.cabos) from public, anon;
