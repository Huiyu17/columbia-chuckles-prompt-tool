import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite(); let checks=0;
const admin='10000000-0000-4000-8000-000000000001', member='10000000-0000-4000-8000-000000000002';
const photo='20000000-0000-4000-8000-000000000001';
const step1='30000000-0000-4000-8000-000000000001',step2='30000000-0000-4000-8000-000000000002',step3='30000000-0000-4000-8000-000000000003';
async function check(name,fn){await fn();console.log(`ok ${++checks} - ${name}`);}
async function rpc(name,args=[]){return (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0]?.value;}
async function session(role,id=''){await db.exec(`reset role; set role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
const save=(id,rev,steps,name='Test chain')=>rpc('tool_save_chain',[id,rev,name,'Test description',JSON.stringify(steps)]);
const steps=[{id:step1,prompt:'Describe image',llm_model_id:null},{id:step2,prompt:'Make it funny',llm_model_id:null},{id:step3,prompt:'Five captions',llm_model_id:null}];
try {
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated;
 create table public.profiles(id uuid primary key,is_superadmin boolean default false);
 create function public.is_superadmin() returns boolean language sql security definer set search_path='' as $$select coalesce((select is_superadmin from public.profiles where id=auth.uid()),false)$$;
 create table public.images(id uuid primary key,url text,alt_text text,storage_path text,user_id uuid,created_at timestamptz default now());
 create table public.generations(id uuid primary key default gen_random_uuid(),user_id uuid,image_id uuid,user_input text,prompt text,model text,generated_content text,withdrawn_at timestamptz);
 create table public.captions(id uuid primary key,image_id uuid,generation_id uuid);
 insert into public.profiles values('${admin}',true),('${member}',false);
 insert into public.images(id,url,alt_text) values('${photo}','https://example.com/photo.png','A sleepy student');`);
 for(const file of ['012_week7_observability.sql','013_generation_pipeline.sql'])await db.exec(await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8'));
 const migration=await readFile(new URL('../supabase/015_prompt_chain_tool.sql',import.meta.url),'utf8');
 await check('migration applies twice without changing live mix',async()=>{await db.exec(migration);await db.exec(migration);assert.equal((await db.query('select weight from public.prompt_chain_mix')).rows[0].weight,'1');});
 for(const [role,id]of [['anon',''],['authenticated',member],['authenticated','']]) {
  await session(role,id);
  for(const [name,args]of [['tool_workspace',[]],['tool_save_chain',[null,0,'Unauthorized','',JSON.stringify([])]],['tool_delete_chain',[admin,0]],['tool_begin_run',[admin,0,photo,'scene','gemini-3.5-flash-lite']],['tool_record_step',[admin,'{}']],['tool_fail_run',[admin]],['tool_media',[null,1]]])
   await check(`${role}/${id||'no session'} denied ${name}`,()=>assert.rejects(()=>rpc(name,args),e=>e.code==='42501'));
  await check(`${role} cannot read run table directly`,()=>assert.rejects(()=>db.query('select * from public.prompt_tool_runs'),e=>e.code==='42501'));
 }
 await session('authenticated',admin);
 let chain;
 await check('create chain and real three-step configuration, excluded from mix',async()=>{chain=await save(null,0,steps);const ws=await rpc('tool_workspace');const c=ws.chains.find(c=>c.id===chain);assert.equal(c.steps.length,3);assert.equal(c.live,false);assert.equal(c.revision,1);});
 await check('atomic reorder without duplicate positions',async()=>{await save(chain,1,[steps[2],steps[0],steps[1]]);const c=(await rpc('tool_workspace')).chains.find(c=>c.id===chain);assert.deepEqual(c.steps.map(s=>s.id),[step3,step1,step2]);assert.deepEqual(c.steps.map(s=>s.step_order),[0,1,2]);});
 await check('stale edits rejected',()=>assert.rejects(()=>save(chain,1,steps),/changed/));
 await check('invalid save rolls back name and step positions',async()=>{await assert.rejects(()=>save(chain,2,[{...steps[0],prompt:''}],'Should roll back'));const c=(await rpc('tool_workspace')).chains.find(c=>c.id===chain);assert.equal(c.name,'Test chain');assert.equal(c.revision,2);assert.deepEqual(c.steps.map(s=>s.step_order),[0,1,2]);});
 await check('reject duplicate steps',()=>assert.rejects(()=>save(chain,2,[steps[0],steps[0]]),/Duplicate/));
 const live='70000000-0000-4000-8000-000000000001';
 await check('protect live public chain from multiple steps',()=>assert.rejects(()=>save(live,0,[steps[0],steps[1]]),/Disable/));
 await check('protect live chain from deletion',()=>assert.rejects(()=>rpc('tool_delete_chain',[live,0]),/Disable/));
 await check('stale generation does not create a run',()=>assert.rejects(()=>rpc('tool_begin_run',[chain,1,photo,'Scene','gemini-3.5-flash-lite']),/changed/));
 let run;
 await check('begin run snapshots ordered instructions and real model',async()=>{run=await rpc('tool_begin_run',[chain,2,photo,'Butler finals','gemini-3.5-flash-lite']);assert.equal(run.plan.steps[0].prompt,'Five captions');assert.equal(run.plan.steps.length,3);});
 await check('duplicate active run prevented',()=>assert.rejects(()=>rpc('tool_begin_run',[chain,2,photo,'Scene','gemini-3.5-flash-lite']),/already active/));
 const result=i=>JSON.stringify({order:i,model:'gemini-3.5-flash-lite',prompt:'Recorded prompt',output:`Actual response ${i+1}`,latencyMs:12,inputTokens:10,outputTokens:4});
 await check('reject out-of-order result',()=>assert.rejects(()=>rpc('tool_record_step',[run.id,result(1)]),/Invalid/));
 await check('record intermediate step without final output',async()=>{await rpc('tool_record_step',[run.id,result(0)]);const r=(await rpc('tool_media',[chain,1])).rows[0];assert.equal(r.status,'running');assert.equal(r.output,null);assert.equal(r.outputs.length,1);});
 await check('editing config does not change an active snapshot',async()=>{await save(chain,2,[steps[0],steps[1]]);await rpc('tool_record_step',[run.id,result(1)]);await rpc('tool_record_step',[run.id,result(2)]);const r=(await rpc('tool_media',[chain,1])).rows[0];assert.equal(r.status,'completed');assert.equal(r.output,'Actual response 3');assert.equal(r.outputs.length,3);});
 await check('completion cannot be overwritten',()=>assert.rejects(()=>rpc('tool_record_step',[run.id,result(2)]),/not active/));
 await check('failure retains completed intermediate steps',async()=>{const r=await rpc('tool_begin_run',[chain,3,photo,'Failed scene','gemini-3.5-flash-lite']);await rpc('tool_record_step',[r.id,result(0)]);await rpc('tool_fail_run',[r.id]);const found=(await rpc('tool_media',[chain,1])).rows.find(x=>x.id===r.id);assert.equal(found.status,'failed');assert.equal(found.outputs.length,1);assert.equal(found.output,null);});
 await check('delete chain keeps generated media and snapshots',async()=>{await rpc('tool_delete_chain',[chain,3]);const all=await rpc('tool_media',[null,1]);assert.ok(all.rows.some(r=>r.id===run.id&&r.chain_id===null&&r.chain_name==='Test chain'&&r.output==='Actual response 3'));assert.ok(!(await rpc('tool_workspace')).chains.some(c=>c.id===chain));});
 await check('empty chain can be created but not run',async()=>{const empty=await save(null,0,[],'Empty');await assert.rejects(()=>rpc('tool_begin_run',[empty,1,photo,'Scene','gemini-3.5-flash-lite']),/1–6/);await rpc('tool_delete_chain',[empty,1]);});
 console.log(`${checks} database checks passed. In-memory PostgreSQL only.`);
} finally {await db.close();}
