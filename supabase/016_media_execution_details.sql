-- Apply after 015. Exposes saved execution snapshots to superadmins only.
begin;
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
      coalesce(r.request->>'context',''),i.url,g.generated_content,
      (select l.error from public.llm_responses l where l.generation_request_id=r.id and l.error is not null order by l.created_at desc,l.id desc limit 1),
      r.created_at,
      coalesce((select jsonb_agg(jsonb_build_object(
        'order',x.ordinal,'model',x.model,'prompt',x.prompt,'output',x.response,'error',x.error,
        'latencyMs',x.latency_ms,'inputTokens',x.input_tokens,'outputTokens',x.output_tokens
      ) order by x.ordinal) from (
        select row_number() over(order by l.created_at,l.id)-1 ordinal,
          coalesce(r.request->>'model',m.name) model,coalesce(l.prompt,r.request->>'prompt') prompt,
          l.response,l.error,l.latency_ms,l.input_tokens,l.output_tokens
        from public.llm_responses l left join public.llm_models m on m.id=l.llm_model_id
        where l.generation_request_id=r.id
      ) x),'[]'::jsonb),
      'caption-app'
      from public.generation_requests r left join public.prompt_chains c on c.id=r.prompt_chain_id
      left join public.images i on i.id=r.image_id left join public.generations g on g.id=r.generation_id
      where p_chain is null or r.prompt_chain_id=p_chain
  ) select jsonb_build_object('total',(select count(*) from media),'rows',coalesce((select jsonb_agg(x) from (
      select * from media order by created_at desc,id limit 12 offset (greatest(1,least(coalesce(p_page,1),100000))-1)*12) x),'[]')) into result;
  return result;
end $$;
revoke all on function public.tool_media(uuid,integer) from public,anon;
grant execute on function public.tool_media(uuid,integer) to authenticated;
commit;
