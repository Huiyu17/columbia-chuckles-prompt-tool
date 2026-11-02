// Real Admin React components; local fixtures only, without hosted data writes.
import assert from 'node:assert/strict';
import {readFile,access,readdir,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=fileURLToPath(new URL('../',import.meta.url));
const admin=path.resolve(root,'../columbia-chuckles-admin');
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const modules=[],registered=new Map();
const virtual={
 'next/link':"exports.__esModule=true;exports.default=p=>require('react').createElement('a',{href:p.href,className:p.className},p.children);",
 'next/image':"exports.__esModule=true;exports.default=p=>require('react').createElement('img',{src:p.src,alt:p.alt,width:p.width,height:p.height,className:p.className});",
 '@/lib/resource-summary':"exports.preview=(s,n=140)=>typeof s==='string'?(s.length>n?s.slice(0,n)+'…':s):'';exports.resourceDate=s=>s?new Date(s).toLocaleString('en-US',{timeZone:'America/New_York'}):null;",
};
async function add(filename,source){
 if(registered.has(filename))return registered.get(filename);
 const id=modules.length;registered.set(filename,id);modules.push(null);
 source??=await readFile(filename,'utf8');
 const code=/\.tsx?$/.test(filename)?ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText:source;
 const deps={};
 for(const [,request]of code.matchAll(/require\(["']([^"']+)["']\)/g)){
  if(virtual[request])deps[request]=await add(request,virtual[request]);
  else {
   let resolved;
   if(request==='react'||request.startsWith('react/'))resolved=require.resolve(request);
   else if(request.startsWith('@/'))resolved=path.join(admin,request.slice(2))+'.ts';
   else {try{resolved=createRequire(path.isAbsolute(filename)?filename:path.join(root,'package.json')).resolve(request);}catch(error){if(!request.startsWith('.'))throw error;const base=path.resolve(path.dirname(filename),request);try{await access(base+'.tsx');resolved=base+'.tsx';}catch{resolved=base+'.ts';}}}
   deps[request]=await add(resolved);
  }
 }
 modules[id]=`[function(require,module,exports){${code}\n},${JSON.stringify(deps)}]`;return id;
}
const entry=await add(path.join(root,'admin-fixture.tsx'),`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import Runs from '../columbia-chuckles-admin/components/ResponseRuns.tsx';
 import Requests from '../columbia-chuckles-admin/components/GenerationRequestsTable.tsx';
 const tool='10000000-0000-4000-8000-000000000001',pub='10000000-0000-4000-8000-000000000002';
 const chains=[{id:'chain',name:'Two-step caption test'}];
 const rows=[{id:tool,prompt_chain_id:'chain',image_id:'photo',user_id:'admin',status:'completed',created_at:'2026-11-03T17:00:00Z',request:{source:'prompt-tool',context:'Five alarms and a morning class.',style:'relatable',step_count:2,model:'gemini-3.5-flash-lite',output:'FINAL_TOOL_CAPTION'}},
 {id:pub,prompt_chain_id:'chain',image_id:'photo',user_id:'admin',status:'completed',created_at:'2026-11-02T17:00:00Z',request:{source:'caption-app',context:'Finals at Butler.',style:'deadpan',model:'gemini-3.5-flash-lite',prompt:'Original public prompt'}},
 {id:'pending',prompt_chain_id:'chain',status:'running',created_at:'2026-11-01T17:00:00Z',request:{source:'caption-app',context:'Waiting for an output',steps:[{}]}}];
 const responses=[{id:'tool-last',generation_request_id:tool,chain_step_order:1,model_name:'gemini-3.5-flash-lite',response:'FINAL_TOOL_CAPTION',prompt:'Actual second prompt with previous output',latency_ms:873,input_tokens:807,output_tokens:16},
 {id:'tool-first',generation_request_id:tool,chain_step_order:0,model_name:'gemini-3.5-flash-lite',response:'FIRST_STEP_ANALYSIS',prompt:'Actual first prompt',latency_ms:0,input_tokens:0,output_tokens:null},
 {id:'public-response',generation_request_id:pub,model_name:'gemini-3.5-flash-lite',response:'FINAL_PUBLIC_CAPTION',prompt:'Actual public prompt',latency_ms:600,input_tokens:50,output_tokens:10}];
 const images=[{id:'photo',url:'https://fixture.local/photo.svg',alt_text:'Input photo'}],users={admin:{first_name:'Hy',last_name:'Y'}};
 const states={[tool]:{state:'not-created',label:'Test only'},[pub]:{state:'draft',label:'Not published'}};
 const root=createRoot(document.getElementById('root'));window.mode='runs';window.query='';
 window.renderFixture=()=>root.render(<main className="fixture-shell">{window.mode==='runs'?<Runs key={'r'+window.query} rows={rows} responses={responses} chains={chains} images={images} models={[]} users={users} query={window.query}/>:<Requests key="requests" rows={rows} responses={responses} chains={chains} images={images} users={users} states={states} query=""/>}</main>);
 window.renderFixture();
`);
const bundle=`(()=>{const process={env:{NODE_ENV:'development'}};const modules=[${modules.join(',')}],cache={};function load(id){if(cache[id])return cache[id].exports;const module=cache[id]={exports:{}};const [fn,deps]=modules[id];fn(name=>load(deps[name]),module,module.exports);return module.exports;}load(${entry});})();`;
let executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
try{await access(playwright.chromium.executablePath());}catch{const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright');const installed=(await readdir(cache)).find(n=>n.startsWith('chromium_headless_shell-'));if(installed)executablePath??=path.join(cache,installed,'chrome-headless-shell-win64/chrome-headless-shell.exe');}
const browser=await playwright.chromium.launch({headless:true,executablePath});
let checks=0;const check=async(name,fn)=>{await fn();console.log(`ok ${++checks} - ${name}`);};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.route('http://localhost:4178/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div></body></html>'}));
 await page.route('https://fixture.local/photo.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" rx="12" fill="#ef7544"/><text x="50" y="64" text-anchor="middle" font-size="50" fill="#24251f">c!</text></svg>'}));
 await page.goto('http://localhost:4178/');await page.addStyleTag({content:await readFile(path.join(admin,'app/globals.css'),'utf8')+'\n.fixture-shell{max-width:1150px;margin:0 auto;padding:24px;}body{margin:0;}'});await page.addScriptTag({content:bundle});
 await check('one card per request, not per individual response',async()=>{await page.locator('.response-run').first().waitFor();assert.equal(await page.locator('.response-run').count(),3);});
 await check('execution shows saved step order and partial totals correctly',async()=>{
  const card=page.locator('.response-run').first();await card.locator('.response-run-execution>summary').click();
  assert.deepEqual(await card.locator('.response-step-output').allTextContents(),['FIRST_STEP_ANALYSIS','FINAL_TOOL_CAPTION']);
  assert.match(await card.locator('.response-run-metrics').innerText(),/873 ms/);assert.match(await card.locator('.response-run-metrics').innerText(),/≥ 16/);
  await card.locator('.response-step-prompt>summary').first().click();assert.equal(await card.locator('.response-step-prompt pre').first().innerText(),'Actual first prompt');
 });
 await mkdir(path.join(root,'artifacts'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts/admin-response-runs-desktop.png'),fullPage:true});
 await check('source filter selects whole runs',async()=>{await page.getByLabel('Source',{exact:true}).selectOption('prompt-tool');assert.equal(await page.locator('.response-run').count(),1);await page.getByLabel('Source',{exact:true}).selectOption('');});
 await check('direct request links open the matching complete execution',async()=>{
  await page.evaluate(()=>{window.query='10000000-0000-4000-8000-000000000001';window.renderFixture();});
  await page.getByRole('button',{name:'Show all generations',exact:true}).waitFor();assert.equal(await page.locator('.response-run').count(),1);assert.equal(await page.locator('.response-run-execution').getAttribute('open'),'');
 });
 await check('mobile execution fits without horizontal overflow',async()=>{await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.screenshot({path:path.join(root,'artifacts/admin-response-runs-mobile.png'),fullPage:true});});
 await check('request details do not display tool output inline',async()=>{
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{window.mode='requests';window.renderFixture();});
  await page.getByRole('button',{name:'View details',exact:true}).first().click();
  assert.doesNotMatch(await page.locator('.request-details').innerText(),/FINAL_TOOL_CAPTION|FIRST_STEP_ANALYSIS/);
  assert.ok(await page.getByRole('link',{name:'View model responses',exact:false}).isVisible());
 });
 assert.deepEqual(errors,[]);console.log(`${checks} browser UI checks passed; fixtures only.`);
}finally{await browser.close();}
