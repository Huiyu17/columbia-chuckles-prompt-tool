-- After 018. Filter before counting and pagination; existing tool_media stays compatible.
begin;
create or replace function public.tool_media_filtered(p_chain uuid default null,p_page integer default 1,p_source text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not coalesce(public.is_superadmin(),false) then raise exception 'Superadmin required' using errcode='42501'; end if;
  if p_source is not null and p_source not in ('caption-app','prompt-tool') then raise exception 'Invalid media source'; end if;
  with media as (
    select id,chain_id,chain_name,status,scene,image_url,output,error,created_at,outputs,'prompt-tool'::text source
      from public.prompt_tool_runs where p_chain is null or chain_id=p_chain
    union all
    select r.id,r.prompt_chain_id,coalesce(c.name,r.request->>'deleted_chain_name',r.request->>'chain_name','Deleted prompt chain'),r.status,
      coalesce(r.request->>'context',''),i.url,g.generated_content,
      coalesce((select l.error from public.llm_responses l where l.generation_request_id=r.id and l.error is not null order by l.created_at desc,l.id desc limit 1),r.request->>'error'),
      r.created_at,
      coalesce((select jsonb_agg(jsonb_build_object(
        'order',x.ordinal,'model',x.model,'prompt',x.prompt,'output',x.response,'error',x.error,
        'latencyMs',x.latency_ms,'inputTokens',x.input_tokens,'outputTokens',x.output_tokens
      ) order by x.ordinal) from (
        select row_number() over(order by l.chain_step_order nulls last,l.created_at,l.id)-1 ordinal,
          coalesce(r.request->'steps'->l.chain_step_order->>'model',m.name,r.request->>'model') model,
          coalesce(l.prompt,r.request->>'prompt') prompt,l.response,l.error,l.latency_ms,l.input_tokens,l.output_tokens
        from public.llm_responses l left join public.llm_models m on m.id=l.llm_model_id where l.generation_request_id=r.id
      ) x),'[]'::jsonb),'caption-app'
      from public.generation_requests r left join public.prompt_chains c on c.id=r.prompt_chain_id
      left join public.images i on i.id=r.image_id left join public.generations g on g.id=r.generation_id
      where p_chain is null or r.prompt_chain_id=p_chain
  ), filtered as (select * from media where p_source is null or source=p_source)
  select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(x) from (
      select * from filtered order by created_at desc,id limit 12 offset (greatest(1,least(coalesce(p_page,1),100000))-1)*12) x),'[]')) into result;
  return result;
end $$;
revoke all on function public.tool_media_filtered(uuid,integer,text) from public,anon;
grant execute on function public.tool_media_filtered(uuid,integer,text) to authenticated;
commit;
