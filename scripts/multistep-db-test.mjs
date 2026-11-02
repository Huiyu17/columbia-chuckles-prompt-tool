import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite(); let checks=0;
const admin='10000000-0000-4000-8000-000000000001',member='10000000-0000-4000-8000-000000000002';
const image='20000000-0000-4000-8000-000000000001';
const ids=[1,2,3].map(n=>`30000000-0000-4000-8000-00000000000${n}`);
const steps=ids.map((id,i)=>({id,prompt:`Instruction ${i+1}`,llm_model_id:null}));
const rpc=async(name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0].value;
const check=async(name,fn)=>{await fn();console.log(`ok ${++checks} - ${name}`);};
const session=async(role,id='')=>{await db.exec(`reset role;set role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
const begin=()=>rpc('humor_begin_chain_generation',[image,'Five alarms and a morning class','relatable','Shared scene and style context','gemini-3.5-flash-lite']);
const record=(run,index,text,error=null)=>rpc('humor_record_chain_step',[run.request_id,index,`Exact prompt ${index}`,text,error,873,807,16]);
const save=(chain,revision,values)=>rpc('tool_save_chain',[chain,revision,'Multi-step live chain','',JSON.stringify(values)]);
try {
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated;
 create table public.profiles(id uuid primary key,is_superadmin boolean default false);
 create function public.is_superadmin() returns boolean language sql security definer set search_path='' as $$select coalesce((select is_superadmin from public.profiles where id=auth.uid()),false)$$;
 create table public.images(id uuid primary key,url text,alt_text text,storage_path text,user_id uuid,created_at timestamptz default now());
 create table public.generations(id uuid primary key default gen_random_uuid(),user_id uuid,image_id uuid,user_input text,prompt text,model text,generated_content text,withdrawn_at timestamptz);
 create table public.captions(id uuid primary key default gen_random_uuid(),image_id uuid,generation_id uuid,content text,created_at timestamptz default now());
 insert into public.profiles values('${admin}',true),('${member}',false);
 insert into public.images(id,url,alt_text) values('${image}','https://example.com/photo.png','Sleepy cartoon');`);
 for(const name of ['012_week7_observability.sql','013_generation_pipeline.sql','015_prompt_chain_tool.sql','016_media_execution_details.sql']) await db.exec(await readFile(new URL(`../supabase/${name}`,import.meta.url),'utf8'));
 await session('authenticated',admin);
 const chain=await save(null,0,steps);
 const migration=await readFile(new URL('../supabase/017_public_multistep_chains.sql',import.meta.url),'utf8');
 await session('postgres');
 await check('migration is repeatable and backfills disabled settings without altering active mix',async()=>{
   await db.exec(migration);await db.exec(migration);
   const mix=(await db.query('select * from public.prompt_chain_mix where prompt_chain_id=$1',[chain])).rows[0];
   assert.equal(mix.enabled,false);assert.equal(Number(mix.weight),1);
   assert.equal((await db.query('select count(*)::integer n from public.prompt_chain_mix where enabled')).rows[0].n,1);
 });
 for(const [role,user] of [['anon',''],['authenticated',member],['authenticated','']]) {
   await session(role,user);
   await check(`${role}/${user||'no session'} cannot edit mix`,()=>assert.rejects(()=>rpc('admin_save_chain_mix',[JSON.stringify([{chain,enabled:true,weight:1}])]),e=>e.code==='42501'));
 }
 await session('authenticated',admin);
 await check('new chains automatically have disabled mix settings',async()=>{
   const second=await save(null,0,[{...steps[0],id:'40000000-0000-4000-8000-000000000001'}]);
   const workspace=await rpc('tool_workspace');assert.equal(workspace.chains.find(row=>row.id===second).live,false);
   await rpc('tool_delete_chain',[second,1]);
 });
 await check('zero-step chains rejected in database',()=>assert.rejects(()=>save(null,0,[]),/one to six/));
 const live='70000000-0000-4000-8000-000000000001';
 await rpc('admin_save_chain_mix',[JSON.stringify([{chain:live,enabled:false,weight:1},{chain,enabled:true,weight:1}])]);
 await check('mix batch rolls back all settings if one fails',async()=>{
   await assert.rejects(()=>rpc('admin_save_chain_mix',[JSON.stringify([{chain,enabled:false,weight:1},{chain:live,enabled:true,weight:-1}])]));
   assert.equal((await rpc('tool_workspace')).chains.find(row=>row.id===chain).live,true);
 });
 await session('authenticated',member);
 let run;
 await check('ordinary member can generate from enabled three-step chain',async()=>{
   run=await begin();assert.equal(run.steps.length,3);assert.deepEqual(run.steps.map(row=>row.instruction),steps.map(row=>row.prompt));
 });
 await check('cannot record out of order',()=>assert.rejects(()=>record(run,1,'Skipped first step'),/order/));
 await check('intermediate output is saved without creating a draft',async()=>{assert.equal(await record(run,0,'Image analysis'),null);});
 await session('authenticated',admin);
 await check('cannot finish another user request',()=>assert.rejects(()=>record(run,1,'Stolen request'),e=>e.code==='42501'));
 await check('active chain may be edited and reordered without changing existing snapshot',async()=>{await save(chain,1,[steps[2],steps[0]]);});
 await session('authenticated',member);
 await check('completion follows original three-step snapshot and preserves long final output',async()=>{
   await record(run,1,'Five candidate captions');
   const content='A configured output, with multiple captions. '.repeat(30);
   const draft=await record(run,2,content);assert.ok(draft);assert.equal(await record(run,2,content),draft);
   await session('authenticated',admin);
   const media=(await rpc('tool_media',[chain,1])).rows.find(row=>row.id===run.request_id);
   assert.equal(media.output,content.trim());assert.equal(media.outputs.length,3);
   assert.equal(media.outputs[0].latencyMs,873);assert.equal(media.outputs[0].inputTokens,807);
   assert.equal(media.outputs[2].prompt,'Exact prompt 2');
 });
 await session('authenticated',member);
 let next;
 await check('next run uses new two-step reordered configuration',async()=>{next=await begin();assert.deepEqual(next.steps.map(row=>row.instruction),[steps[2].prompt,steps[0].prompt]);});
 await check('duplicate active request blocked',()=>assert.rejects(()=>begin(),/already running/));
 await check('step failure is recorded and stops later completion',async()=>{
   await record(next,0,null,'Provider unavailable');await assert.rejects(()=>record(next,1,'Must not run'),/no longer running/);
   await session('authenticated',admin);
   const found=(await rpc('tool_media',[chain,1])).rows.find(row=>row.id===next.request_id);
   assert.equal(found.status,'failed');assert.equal(found.error,'Provider unavailable');assert.equal(found.outputs.length,1);
 });
 await check('disabled and zero-weight chains are never selected',async()=>{
   await rpc('admin_save_chain_mix',[JSON.stringify([{chain,enabled:true,weight:0}])]);await assert.rejects(()=>begin(),/No enabled/);
 });
 await session('postgres');
 const correction=await readFile(new URL('../supabase/018_admin_tool_history_single_caption.sql',import.meta.url),'utf8');
 await check('single-caption/history migration applies repeatedly',async()=>{await db.exec(correction);await db.exec(correction);});
 await check('single-caption database validation matches output contract',async()=>{
   for(const text of ['1. First\n2. Second','One\nAnother','word '.repeat(31),'x'.repeat(501),'- A caption','']) assert.equal(await rpc('humor_is_single_caption',[text]),false);
   assert.equal(await rpc('humor_is_single_caption',['My bed has veto power.']),true);
 });
 for(const [role,user] of [['anon',''],['authenticated',member],['authenticated','']]) {
   await session(role,user);await check(`${role}/${user||'no session'} cannot read tool history`,()=>assert.rejects(()=>rpc('admin_tool_run_history',[1]),e=>e.code==='42501'));
 }
 await session('authenticated',admin);
 await rpc('admin_save_chain_mix',[JSON.stringify([{chain,enabled:true,weight:1}])]);
 await check('Admin history includes existing unrestricted tool runs with original usage',async()=>{
   const test=await rpc('tool_begin_run',[chain,2,image,'Test scene','gemini-3.5-flash-lite']);
   for(let i=0;i<2;i++) await rpc('tool_record_step',[test.id,JSON.stringify({order:i,model:'gemini-3.5-flash-lite',prompt:'Actual prompt',output:'1. One candidate\n2. Another candidate',latencyMs:873,inputTokens:807,outputTokens:16})]);
   const history=await rpc('admin_tool_run_history',[1]);const row=history.rows.find(row=>row.id===test.id);
   assert.equal(row.actor_id,admin);assert.equal(row.status,'completed');assert.equal(row.outputs.length,2);
   assert.equal(row.outputs[0].latencyMs,873);assert.equal(row.output,'1. One candidate\n2. Another candidate');
 });
 await session('authenticated',member);
 await check('server rejects a list as public final output even when client omits validation',async()=>{
   const test=await begin();await record(test,0,'Long intermediate analysis. '.repeat(80));
   assert.equal(await record(test,1,'1. First caption\n2. Second caption'),null);
   await session('authenticated',admin);
   const row=(await rpc('tool_media',[chain,1])).rows.find(row=>row.id===test.request_id);
   assert.equal(row.status,'failed');assert.match(row.error,/final step must return one caption/);
 });
 await session('authenticated',member);
 let shortDraft;
 await check('long intermediate and one short final caption create a valid public preview',async()=>{
   const test=await begin();await record(test,0,'Long analysis. '.repeat(100));shortDraft=await record(test,1,'My bed has veto power.');assert.ok(shortDraft);
 });
 await session('postgres',member);
 await check('old long previews remain preserved but cannot be newly published',async()=>{
   const old=(await db.query('select id from public.generations where length(generated_content)>500 limit 1')).rows[0];
   assert.ok(old);await assert.rejects(()=>rpc('humor_publish_preview',[old.id]),e=>e.code==='22023');
 });
 await check('short caption publication remains idempotent',async()=>{
   const caption=await rpc('humor_publish_preview',[shortDraft]);assert.ok(caption);assert.equal(await rpc('humor_publish_preview',[shortDraft]),caption);
 });
 await session('postgres');
 const sourceMigration=await readFile(new URL('../supabase/019_media_source_filter.sql',import.meta.url),'utf8');
 await check('media source migration is repeatable',async()=>{await db.exec(sourceMigration);await db.exec(sourceMigration);});
 await db.query(`insert into public.prompt_tool_runs(chain_id,actor_id,chain_name,scene,image_id,image_url,plan,status,output)
   select $1,$2,'Source pagination test','Test scene',$3,'https://example.com/photo.png','{}','completed','Test output' from generate_series(1,14)`,[chain,admin,image]);
 await session('authenticated',admin);
 await check('source filter is applied before counting and pagination',async()=>{
   const tools=await rpc('tool_media_filtered',[chain,1,'prompt-tool']);const second=await rpc('tool_media_filtered',[chain,2,'prompt-tool']);
   assert.equal(tools.rows.length,12);assert.equal(second.rows.length,tools.total-12);
   assert.ok(tools.rows.every(row=>row.source==='prompt-tool'&&row.chain_id===chain));
   assert.ok(second.rows.every(row=>row.source==='prompt-tool'));
   const publicMedia=await rpc('tool_media_filtered',[chain,1,'caption-app']);
   assert.ok(publicMedia.total>0);assert.ok(publicMedia.rows.every(row=>row.source==='caption-app'&&row.chain_id===chain));
   assert.equal((await rpc('tool_media_filtered',[chain,1,null])).total,tools.total+publicMedia.total);
   assert.equal((await rpc('tool_media',[chain,1])).total,tools.total+publicMedia.total);
 });
 await check('invalid source is rejected',()=>assert.rejects(()=>rpc('tool_media_filtered',[null,1,'invalid']),/Invalid media source/));
 for(const [role,user] of [['anon',''],['authenticated',member]]) {
   await session(role,user);await check(`${role} cannot use source filtering`,()=>assert.rejects(()=>rpc('tool_media_filtered',[null,1,'prompt-tool']),e=>e.code==='42501'));
 }
 console.log(`${checks} multi-step database checks passed.`);
} finally {await db.close();}
