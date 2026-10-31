// Actual React components, simulated RPC responses. Never writes hosted data.
import assert from 'node:assert/strict';
import { readFile, access, readdir, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const modules=[], registered=new Map();
const virtual={
 'next/link':"exports.__esModule=true;exports.default=p=>require('react').createElement('a',{href:p.href,className:p.className},p.children);",
 'next/navigation':"exports.useRouter=()=>({push:href=>window.navigate(href),refresh:()=>window.renderFixture()});",
 '@/app/actions/chains':"exports.saveChain=(...args)=>window.save(...args);exports.deleteChain=(...args)=>window.remove(...args);exports.findPhotos=(...args)=>window.photos(...args);exports.generateMedia=(...args)=>window.generate(...args);"
};
async function add(filename,source){
 if(registered.has(filename))return registered.get(filename);
 const id=modules.length;registered.set(filename,id);modules.push(null);
 source??=await readFile(filename,'utf8');
 const code=/\.tsx?$/.test(filename)?ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText:source;
 const deps={};
 for(const [,request]of code.matchAll(/require\(["']([^"']+)["']\)/g)){
  if(virtual[request])deps[request]=await add(request,virtual[request]);
  else {const resolved=createRequire(path.isAbsolute(filename)?filename:path.join(root,'package.json')).resolve(request);deps[request]=await add(resolved);}
 }
 modules[id]=`[function(require,module,exports){${code}\n},${JSON.stringify(deps)}]`;return id;
}
const entry=await add(path.join(root,'fixture.tsx'),`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import Workspace from './components/ChainWorkspace.tsx';import Theme from './components/ThemePicker.tsx';
 window.chain={id:'10000000-0000-4000-8000-000000000001',name:'Campus caption',description:'Visual humor',revision:1,live:false,steps:[{id:'20000000-0000-4000-8000-000000000001',prompt:'Describe the photo',llm_model_id:null,step_order:0},{id:'20000000-0000-4000-8000-000000000002',prompt:'Write five captions',llm_model_id:null,step_order:1}]};
 window.selected=window.chain.id;window.navigation=[];window.failSave=false;
 window.navigate=href=>window.navigation.push(href);
 window.save=async(id,revision,name,description,steps)=>{window.lastSave={id,revision,name,description,steps};if(window.failSave)return {error:'Simulated conflict'};window.chain={...window.chain,name,description,steps,revision:revision+1};return {id:window.chain.id};};
 window.remove=async()=>{window.deleted=true;return {success:true};};
 window.photos=async()=>({total:1,rows:[{id:'30000000-0000-4000-8000-000000000001',url:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="%23ef7544"/></svg>',alt_text:'Student at Butler',storage_path:'owner/photo.png'}]});
 window.generate=async(...args)=>{window.generated=args;return {id:'run',output:'Five final captions from a simulated model.'};};
 const root=createRoot(document.getElementById('root'));
 window.renderFixture=()=>root.render(<><Theme/><Workspace data={{chains:[window.chain],models:[{id:'model',name:'Google test model',provider:'Google'}]}} selected={window.selected}/></>);
 window.renderFixture();
`);
const bundle=`(()=>{const process={env:{NODE_ENV:'development'}};const modules=[${modules.join(',')}],cache={};function load(id){if(cache[id])return cache[id].exports;const module=cache[id]={exports:{}};const [fn,deps]=modules[id];fn(name=>load(deps[name]),module,module.exports);return module.exports;}load(${entry});})();`;
let executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
try{await access(playwright.chromium.executablePath());}catch{const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright');const installed=(await readdir(cache)).find(n=>n.startsWith('chromium_headless_shell-'));if(installed)executablePath??=path.join(cache,installed,'chrome-headless-shell-win64/chrome-headless-shell.exe');}
const browser=await playwright.chromium.launch({headless:true,executablePath});
let checks=0;const check=async(name,fn)=>{await fn();console.log(`ok ${++checks} - ${name}`);};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://localhost:4177/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body><div id="root"></div></body></html>'}));
 await page.goto('http://localhost:4177/');await page.addStyleTag({content:await readFile(new URL('../app/globals.css',import.meta.url),'utf8')});await page.addScriptTag({content:bundle});
 await check('saved chain initially disables save',async()=>{await page.getByRole('heading',{name:'Prompt chain steps',exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'Save changes',exact:true}).isDisabled());});
 await check('reorder saves whole chain using full identifiers and contiguous order',async()=>{await page.getByRole('button',{name:'Move step 2 up',exact:true}).click();assert.equal(await page.locator('.steps textarea').first().inputValue(),'Write five captions');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByRole('status').filter({hasText:'Prompt chain saved.'}).waitFor();assert.equal(await page.evaluate(()=>window.lastSave.steps[0].id),'20000000-0000-4000-8000-000000000002');assert.ok(await page.getByRole('button',{name:'Save changes',exact:true}).isDisabled());});
 await check('failed save preserves unsaved instruction',async()=>{await page.evaluate(()=>window.failSave=true);await page.locator('.steps textarea').first().fill('Keep this unsaved change');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('.steps textarea').first().inputValue(),'Keep this unsaved change');await page.getByRole('button',{name:'Discard changes',exact:true}).click();assert.equal(await page.locator('.steps textarea').first().inputValue(),'Write five captions');await page.evaluate(()=>window.failSave=false);});
 await check('adding and removing steps are reversible before save',async()=>{await page.getByRole('button',{name:'+ Add prompt chain step',exact:true}).click();assert.equal(await page.locator('.steps textarea').count(),3);await page.getByRole('button',{name:'Delete step 3',exact:true}).click();assert.equal(await page.locator('.steps textarea').count(),2);});
 await check('select photo by description then generate saved chain',async()=>{await page.getByRole('button',{name:'Find photos',exact:true}).click();await page.getByRole('button',{name:'Student at Butler',exact:true}).click();await page.getByLabel('Scene',{exact:true}).fill('Finals at Butler');await page.getByRole('button',{name:'Generate media',exact:true}).click();await page.getByText('Five final captions from a simulated model.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.generated[2]),'30000000-0000-4000-8000-000000000001');assert.equal(await page.getByRole('link',{name:'View generated media →',exact:true}).getAttribute('href'),'/?view=media&chain=10000000-0000-4000-8000-000000000001');});
 await check('appearance persists and system mode follows OS',async()=>{const picker=page.getByLabel('Appearance',{exact:true});await picker.selectOption('dark');assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()),'#181a18');assert.equal(await page.evaluate(()=>localStorage.getItem('chuckles-theme')),'dark');await picker.selectOption('light');await page.emulateMedia({colorScheme:'dark'});assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()),'#faf9f6');await picker.selectOption('system');assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()),'#181a18');await page.emulateMedia({colorScheme:'light'});assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()),'#faf9f6');});
 await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
 await page.screenshot({path:fileURLToPath(new URL('../artifacts/editor-light.png',import.meta.url)),fullPage:true});
 await check('mobile editor has no horizontal overflow',async()=>{await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.screenshot({path:fileURLToPath(new URL('../artifacts/editor-mobile.png',import.meta.url)),fullPage:true});});
 await check('deletion requires explicit second confirmation',async()=>{await page.getByRole('button',{name:'Delete prompt chain',exact:true}).click();assert.equal(await page.evaluate(()=>window.deleted),undefined);await page.getByRole('button',{name:'Confirm deletion',exact:true}).click();assert.equal(await page.evaluate(()=>window.deleted),true);});
 assert.deepEqual(errors,[]);console.log(`${checks} browser checks passed. Fixtures only; no hosted CRUD acceptance implied.`);
}finally{await browser.close();}
