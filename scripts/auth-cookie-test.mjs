// Uses the installed SSR SDK with simulated Auth responses; no real credentials.
import assert from 'node:assert/strict';
import {createBrowserClient,createServerClient} from '@supabase/ssr';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const code=ts.transpileModule(await readFile(new URL('../lib/supabase/options.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {authCookieEncoding}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const user={id:'10000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'test@example.com',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'google'},user_metadata:{large_profile:'profile-data-'.repeat(2500)}};
const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600}].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')+'.fake-signature';
const authFetch=async url=>{assert.equal(new URL(String(url)).pathname,'/auth/v1/user');return new Response(JSON.stringify(user),{status:200,headers:{'content-type':'application/json'}});};
async function fixture(encode){
 const jar=new Map();
 const cookies={encode,getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value,options})=>{if(options.maxAge===0)jar.delete(name);else jar.set(name,value);})};
 const browser=createBrowserClient('https://fixture.supabase.co','fixture-key',{isSingleton:false,cookies,auth:{autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:authFetch}});
 const result=await browser.auth.setSession({access_token:jwt,refresh_token:'fixture-refresh-token'});
 assert.equal(result.error,null);assert.equal(result.data.user.id,user.id);
 const bytes=Buffer.byteLength([...jar].map(([name,value])=>`${name}=${value}`).join('; '));
 return {browser,cookies,jar,bytes};
}
const compact=await fixture(authCookieEncoding),full=await fixture('user-and-tokens');
assert.equal(authCookieEncoding,'tokens-only');assert.ok(compact.bytes<4000);assert.ok(compact.bytes<full.bytes/5);
const server=createServerClient('https://fixture.supabase.co','fixture-key',{cookies:compact.cookies,global:{fetch:authFetch}});
const verified=await server.auth.getUser();assert.equal(verified.error,null);assert.equal(verified.data.user.id,user.id);
const browserReload=createBrowserClient('https://fixture.supabase.co','fixture-key',{isSingleton:false,cookies:compact.cookies,auth:{autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:authFetch}});
const reloaded=await browserReload.auth.getUser();assert.equal(reloaded.error,null);assert.equal(reloaded.data.user.id,user.id);
await compact.browser.auth.dispose();await full.browser.auth.dispose();await server.auth.dispose();await browserReload.auth.dispose();
console.log(`Auth cookie checks passed: compact session ${compact.bytes} bytes vs ${full.bytes} bytes with full profile; server and browser still verify the user.`);
