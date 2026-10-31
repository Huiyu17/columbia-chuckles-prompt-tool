-- Shared database, after 008–014. Does not enable any chain in the public mix.
begin;
alter table public.prompt_chains add column if not exists revision integer not null default 0;
create table if not exists public.prompt_tool_runs (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid references public.prompt_chains(id) on delete set null,
  actor_id uuid not null references public.profiles(id),
  chain_name text not null, scene text not null,
  image_id uuid references public.images(id) on delete set null,
  image_url text, plan jsonb not null,
  status text not null default 'running' check(status in ('running','completed','failed')),
  outputs jsonb not null default '[]', output text, error text,
  created_at timestamptz not null default now()
);
create index if not exists prompt_tool_runs_chain_time on public.prompt_tool_runs(chain_id,created_at desc);
alter table public.prompt_tool_runs enable row level security;
revoke all on public.prompt_tool_runs from public, anon, authenticated;

create or replace function public.tool_workspace() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(public.is_superadmin(),false) then raise exception 'Superadmin required' using errcode='42501'; end if;
  if (select count(*) from public.prompt_chains)>1000 or (select count(*) from public.prompt_chain_steps)>6000 then
    raise exception 'Workspace is too large to load safely'; end if;
  return jsonb_build_object(
    'chains',(select coalesce(jsonb_agg(x order by x.name,x.id),'[]') from (
      select c.*,exists(select 1 from public.prompt_chain_mix m where m.prompt_chain_id=c.id and m.enabled and m.weight>0) as live,
        (select coalesce(jsonb_agg(s order by s.step_order),'[]') from public.prompt_chain_steps s where s.prompt_chain_id=c.id) steps
      from public.prompt_chains c) x),
    'models',(select coalesce(jsonb_agg(x order by x.name),'[]') from (
      select m.id,m.name,p.name as provider from public.llm_models m join public.llm_providers p on p.id=m.provider_id where p.name='Google') x));
end $$;

create or replace function public.tool_save_chain(p_id uuid,p_revision integer,p_name text,p_description text,p_steps jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare chain uuid:=p_id; current_revision integer; item jsonb; ordinal integer:=0; step_id uuid;
begin
  if not coalesce(public.is_superadmin(),false) then raise exception 'Superadmin required' using errcode='42501'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 120 or length(coalesce(p_description,''))>2000
    or p_steps is null or jsonb_typeof(p_steps)<>'array' then raise exception 'Invalid chain'; end if;
  if jsonb_array_length(p_steps)>6 then raise exception 'Use at most six steps'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_steps))<>jsonb_array_length(p_steps) then raise exception 'Duplicate step'; end if;
  if chain is null then
    insert into public.prompt_chains(name,description) values(trim(p_name),p_description) returning id into chain;
  else
    select revision into current_revision from public.prompt_chains where id=chain for update;
    if current_revision is null then raise exception 'Chain no longer exists'; end if;
    if p_revision is distinct from current_revision then raise exception 'This chain changed. Reload before saving.'; end if;
    -- Lock mix before examining it; updates serialize with the existing admin editor.
    perform 1 from public.prompt_chain_mix where prompt_chain_id=chain for update;
    if jsonb_array_length(p_steps)<>1 and exists(select 1 from public.prompt_chain_mix where prompt_chain_id=chain and enabled and weight>0) then
      raise exception 'Disable this chain in the admin Prompt chain mix before changing its step count.'; end if;
  end if;
  for item in select value from jsonb_array_elements(p_steps) loop
    step_id:=(item->>'id')::uuid;
    if step_id is null or length(trim(coalesce(item->>'prompt',''))) not between 1 and 10000 then raise exception 'Each step needs an instruction'; end if;
    if exists(select 1 from public.prompt_chain_steps where id=step_id and prompt_chain_id<>chain) then raise exception 'Step belongs to another chain'; end if;
    if nullif(item->>'llm_model_id','') is not null and not exists(
      select 1 from public.llm_models m join public.llm_providers p on p.id=m.provider_id
      where m.id=(item->>'llm_model_id')::uuid and p.name='Google') then raise exception 'Choose a registered Google model'; end if;
  end loop;
  -- Move retained steps above every old position before assigning final positions.
  update public.prompt_chain_steps set step_order=step_order+100000 where prompt_chain_id=chain;
  update public.llm_responses set prompt_chain_step_id=null where prompt_chain_step_id in (
    select s.id from public.prompt_chain_steps s where s.prompt_chain_id=chain
      and not exists(select 1 from jsonb_array_elements(p_steps) j where (j->>'id')::uuid=s.id));
  delete from public.prompt_chain_steps s where s.prompt_chain_id=chain
    and not exists(select 1 from jsonb_array_elements(p_steps) j where (j->>'id')::uuid=s.id);
  for item in select value from jsonb_array_elements(p_steps) loop
    insert into public.prompt_chain_steps(id,prompt_chain_id,step_order,llm_model_id,prompt)
      values((item->>'id')::uuid,chain,ordinal,nullif(item->>'llm_model_id','')::uuid,trim(item->>'prompt'))
      on conflict(id) do update set step_order=excluded.step_order,llm_model_id=excluded.llm_model_id,prompt=excluded.prompt;
    ordinal:=ordinal+1;
  end loop;
  update public.prompt_chains set name=trim(p_name),description=p_description,revision=revision+1 where id=chain;
  return chain;
end $$;

create or replace function public.tool_delete_chain(p_id uuid,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare rev integer;
begin
  if not coalesce(public.is_superadmin(),false) then raise exception 'Superadmin required' using errcode='42501'; end if;
  select revision into rev from public.prompt_chains where id=p_id for update;
  if rev is null or rev is distinct from p_revision then raise exception 'Chain changed or no longer exists. Reload first.'; end if;
  perform 1 from public.prompt_chain_mix where prompt_chain_id=p_id for update;
  if exists(select 1 from public.prompt_chain_mix where prompt_chain_id=p_id and enabled and weight>0) then
    raise exception 'Disable this chain in the admin Prompt chain mix before deleting it.'; end if;
  -- Keep request/response/generation history, detaching only configuration references.
  update public.generation_requests set request=request || jsonb_build_object('deleted_chain_name',(select name from public.prompt_chains where id=p_id)),prompt_chain_id=null where prompt_chain_id=p_id;
  update public.llm_responses set prompt_chain_step_id=null where prompt_chain_step_id in(select id from public.prompt_chain_steps where prompt_chain_id=p_id);
  delete from public.prompt_chain_mix where prompt_chain_id=p_id;
  delete from public.prompt_chain_steps where prompt_chain_id=p_id;
  delete from public.prompt_chains where id=p_id;
end $$;

create or replace function public.tool_begin_run(p_chain uuid,p_revision integer,p_image uuid,p_scene text,p_default_model text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.prompt_chains; photo public.images; plan jsonb; run_id uuid; n integer;
begin
  if not coalesce(public.is_superadmin(),false) then raise exception 'Superadmin required' using errcode='42501'; end if;
  if length(trim(coalesce(p_scene,''))) not between 1 and 1000 then raise exception 'Enter a scene (1–1000 characters)'; end if;
  select * into c from public.prompt_chains where id=p_chain for update;
  if c.id is null or c.revision is distinct from p_revision then raise exception 'Chain changed. Reload and review before generating.'; end if;
  select * into photo from public.images where id=p_image;
  if photo.id is null then raise exception 'Choose an available photo'; end if;
  select count(*) into n from public.prompt_chain_steps where prompt_chain_id=p_chain;
  if n not between 1 and 6 then raise exception 'A run needs 1–6 steps'; end if;
  if exists(select 1 from public.prompt_chain_steps s
    left join public.llm_models m on m.id=s.llm_model_id or (s.llm_model_id is null and m.name=p_default_model and m.provider_id in(select id from public.llm_providers where name='Google'))
    left join public.llm_providers p on p.id=m.provider_id
    where s.prompt_chain_id=p_chain and (m.id is null or p.name is distinct from 'Google' or length(trim(s.prompt))=0)) then
    raise exception 'Every step needs an instruction and a registered Google model'; end if;
  select jsonb_build_object('scene',trim(p_scene),'description',photo.alt_text,'steps',jsonb_agg(jsonb_build_object('prompt',s.prompt,'model',m.name) order by s.step_order)) into plan
    from public.prompt_chain_steps s join public.llm_models m on m.id=s.llm_model_id or (s.llm_model_id is null and m.name=p_default_model and m.provider_id in(select id from public.llm_providers where name='Google'))
    where s.prompt_chain_id=p_chain;
  -- At most one active run per admin. Abandoned runs expire after five minutes.
  perform 1 from public.profiles where id=auth.uid() for update;
  update public.prompt_tool_runs set status='failed',error='Execution was interrupted before completion.' where actor_id=auth.uid() and status='running' and created_at<now()-interval '5 minutes';
  if exists(select 1 from public.prompt_tool_runs where actor_id=auth.uid() and status='running') then raise exception 'A run is already active. Wait for it to finish.'; end if;
  insert into public.prompt_tool_runs(chain_id,actor_id,chain_name,scene,image_id,image_url,plan)
    values(c.id,auth.uid(),c.name,trim(p_scene),photo.id,photo.url,plan) returning id into run_id;
  return jsonb_build_object('id',run_id,'plan',plan,'storage_path',photo.storage_path);
end $$;

create or replace function public.tool_record_step(p_run uuid,p_step jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r public.prompt_tool_runs; idx integer;
begin
  if not coalesce(public.is_superadmin(),false) then raise exception 'Superadmin required' using errcode='42501'; end if;
  select * into r from public.prompt_tool_runs where id=p_run and actor_id=auth.uid() for update;
  if r.id is null or r.status<>'running' then raise exception 'Run is not active'; end if;
  idx:=jsonb_array_length(r.outputs);
  if (p_step->>'order')::integer is distinct from idx or idx>=jsonb_array_length(r.plan->'steps')
    or length(trim(coalesce(p_step->>'output',''))) not between 1 and 20000
    or length(coalesce(p_step->>'prompt',''))>40000
    or p_step->>'model' is distinct from r.plan->'steps'->idx->>'model'
    or (p_step->>'latencyMs')::integer<0
    or (p_step->>'inputTokens')::integer<0 or (p_step->>'outputTokens')::integer<0 then raise exception 'Invalid step result'; end if;
  update public.prompt_tool_runs set outputs=outputs || jsonb_build_array(p_step),
    status=case when idx+1=jsonb_array_length(plan->'steps') then 'completed' else 'running' end,
    output=case when idx+1=jsonb_array_length(plan->'steps') then p_step->>'output' else null end where id=p_run;
end $$;

create or replace function public.tool_fail_run(p_run uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(public.is_superadmin(),false) then raise exception 'Superadmin required' using errcode='42501'; end if;
  update public.prompt_tool_runs set status='failed',error='Generation stopped. Review the completed steps and try a new run.'
    where id=p_run and actor_id=auth.uid() and status='running';
end $$;

create or replace function public.tool_media(p_chain uuid default null,p_page integer default 1) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not coalesce(public.is_superadmin(),false) then raise exception 'Superadmin required' using errcode='42501'; end if;
  with media as (
    select id,chain_id,chain_name,status,scene,image_url,output,error,created_at,outputs,'prompt-tool'::text source
      from public.prompt_tool_runs where p_chain is null or chain_id=p_chain
    union all
    select r.id,r.prompt_chain_id,coalesce(c.name,r.request->>'deleted_chain_name','Deleted prompt chain'),r.status,
      coalesce(r.request->>'context',''),i.url,g.generated_content,null,r.created_at,'[]'::jsonb,'caption-app'
      from public.generation_requests r left join public.prompt_chains c on c.id=r.prompt_chain_id
      left join public.images i on i.id=r.image_id left join public.generations g on g.id=r.generation_id
      where p_chain is null or r.prompt_chain_id=p_chain
  ) select jsonb_build_object('total',(select count(*) from media),'rows',coalesce((select jsonb_agg(x) from (
      select * from media order by created_at desc,id limit 12 offset (greatest(1,least(coalesce(p_page,1),100000))-1)*12) x),'[]')) into result;
  return result;
end $$;

revoke all on function public.tool_workspace(),public.tool_save_chain(uuid,integer,text,text,jsonb),public.tool_delete_chain(uuid,integer),public.tool_begin_run(uuid,integer,uuid,text,text),public.tool_record_step(uuid,jsonb),public.tool_fail_run(uuid),public.tool_media(uuid,integer) from public,anon;
grant execute on function public.tool_workspace(),public.tool_save_chain(uuid,integer,text,text,jsonb),public.tool_delete_chain(uuid,integer),public.tool_begin_run(uuid,integer,uuid,text,text),public.tool_record_step(uuid,jsonb),public.tool_fail_run(uuid),public.tool_media(uuid,integer) to authenticated;
commit;
