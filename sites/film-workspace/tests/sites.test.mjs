import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {writeLink,readLink,linkAccount,linkedSession} from '../server/account-vault.mjs';
import {handle,allowedProxy} from '../worker/index.mjs';
import {runTool} from '../server/storyboard-tools.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const origin='https://test.chatgpt.site';
function environment(){
 const data=new Map();return {data,MCP_OWNER_SUPABASE_USER_ID:'db-a',SESSION_VAULT_KEY:Buffer.alloc(32,2).toString('base64'),SUPABASE_URL:'https://lfvsimzmjhceyvjaoats.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',BUCKET:{put:async(k,v)=>{data.set(k,v);},get:async k=>data.has(k)?{json:async()=>JSON.parse(data.get(k))}:null,delete:async k=>{data.delete(k);}}};
}
function request(path,method='GET',body,user='site-a',foreign=false){return new Request(origin+path,{method,headers:{...(user?{'oai-authenticated-user-id':user}:{}),Origin:foreign?'https://evil.test':origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
const session={access_token:'private-access',refresh_token:'private-refresh',expires_at:Date.now()/1000+3600,user_id:'db-a',email:'owner@example.test'};
const backend=async(url,options)=>{
 if(String(url).includes('/token?'))return Response.json({...session,expires_in:3600});
 if(String(url).endsWith('/auth/v1/user'))return Response.json({id:'db-a',email:'owner@example.test'});
 if(String(url).includes('/rest/v1/storyboards'))return Response.json([{id:'board-a',version:3,name:'AfterLife'}]);
 return Response.json({});
};
test('vault encrypts credentials and binds ciphertext to the Site identity',async()=>{
 const env=environment();await writeLink(env,'site-a',session);const raw=[...env.data.values()][0];assert.equal(raw.includes('private-access'),false);assert.equal(raw.includes('owner@example.test'),false);
 assert.deepEqual(await readLink(env,'site-a'),session);assert.equal(await readLink(env,'site-b'),null);
 await writeLink(env,'site-b',session);const keys=[...env.data.keys()];env.data.set(keys[1],raw);await assert.rejects(readLink(env,'site-b'));
});
test('account linking verifies both credentials and refuses email-only or mixed identities',async()=>{
 const env=environment();await assert.rejects(linkAccount(env,'site-a',{email:'owner@example.test'},backend));
 const mismatch=async(url,opts)=>String(url).includes('/token?')?Response.json({access_token:'wrong',refresh_token:'wrong'}):Response.json({id:opts.headers.Authorization==='Bearer wrong'?'db-b':'db-a'});
 await assert.rejects(linkAccount(env,'site-a',{access_token:'a',refresh_token:'b'},mismatch),/do not match/);assert.equal(env.data.size,0);
 await linkAccount(env,'site-a',{access_token:'private-access',refresh_token:'private-refresh'},backend);assert.equal((await linkedSession(env,'site-a',backend)).user.id,'db-a');
});
test('dispatch identity and same-origin checks deny unauthorized reads/linking',async()=>{
 const env=environment();assert.equal((await handle(request('/api/account','GET',null,null),env,{},backend)).status,401);
 assert.equal((await handle(request('/api/account-link','POST',session,'site-a',true),env,{},backend)).status,403);
 assert.equal(env.data.size,0);
});
test('proxy limits operations and forwards only the linked account token',async()=>{
 const env=environment();await writeLink(env,'site-a',session);const calls=[];
 const fetcher=async(url,options)=>{calls.push({url:String(url),options});return backend(url,options);};
 const response=await handle(request('/api/supabase/rest/v1/storyboards?select=id,name'),env,{},fetcher);assert.equal(response.status,200);
 const call=calls.find(c=>c.url.includes('/rest/'));assert.equal(call.options.headers.Authorization,'Bearer private-access');assert.equal(call.options.headers.apikey,'sb_publishable_fixture');
 assert.equal((await handle(request('/api/supabase/rest/v1/storyboards'),env,{},backend)).status,200);
 assert.equal((await handle(request('/api/supabase/rest/v1/storyboards','GET',null,'site-b'),env,{},backend)).status,401);
 assert.equal(allowedProxy('/rest/v1/users','GET'),false);assert.equal(allowedProxy('/rest/v1/storyboards','DELETE'),false);assert.equal(allowedProxy('/rest/v1/rpc/arbitrary_sql','POST'),false);assert.equal(allowedProxy('/storage/v1/object/public/other/file','GET'),false);
});
test('native MCP discovers tools without leaking tokens and requires each callers account link',async()=>{
 const env=environment();const call=(name,args,user)=>request('/mcp','POST',{jsonrpc:'2.0',id:1,method:name,params:args},user);
 const discovery=await handle(call('server/discover',{},null),env);assert.deepEqual((await discovery.json()).result.supportedVersions,['2026-07-28']);
 const tools=await handle(call('tools/list',{},null),env);assert.equal((await tools.json()).result.tools.length,6);
 const denied=await handle(call('tools/call',{name:'list_storyboards',arguments:{}},'site-b'),env,{},backend);assert.equal((await denied.json()).result.isError,true);
 await writeLink(env,'site-a',session);const allowed=await handle(call('tools/call',{name:'list_storyboards',arguments:{}},'site-a'),env,{},backend);const value=await allowed.json();assert.equal(value.result.structuredContent.storyboards[0].name,'AfterLife');assert.equal(JSON.stringify(value).includes('private-access'),false);
});
test('unlink removes both browser and MCP access even if provider logout fails',async()=>{
 const env=environment();await writeLink(env,'site-a',session);
 const result=await handle(request('/api/account-link','DELETE'),env,{},async()=>{throw Error('offline');});assert.equal(result.status,200);assert.equal(await readLink(env,'site-a'),null);
 assert.equal((await handle(request('/api/supabase/auth/v1/user'),env,{},backend)).status,401);
});
test('planning gaps distinguish missing frames/location text from location readiness',async()=>{
 const board={id:'cae28003-b2f1-4ba2-9075-20ed454e9f50',name:'AfterLife',version:3,document:{shots:[{id:'a',location:'Beach',imagePath:'private'},{id:'b',desc:'Missing frame and location'}],planning:{requirements:[{name:'Cup',readiness:'needed'}]}}};
 const result=await runTool({list:async()=>[board]},{id:'db-a'},'get_planning_gaps',{storyboard_id:board.id});
 assert.deepEqual(result.missing_frames.map(s=>s.id),['b']);assert.deepEqual(result.missing_location_names.map(s=>s.id),['b']);assert.deepEqual(result.mentioned_locations,['Beach']);assert.match(result.limitation,/not yet tracked/);
});

test('public app and publishable config do not require ChatGPT; private account APIs do',async()=>{
 const env=environment();
 const index=await handle(request('/','GET',null,null),env,{},backend);assert.equal(index.status,200);assert.equal(index.headers.get('location'),null);
 const config=await handle(request('/runtime-config.json','GET',null,null),env,{},backend);const value=await config.json();assert.equal(config.status,200);assert.equal(value.supabasePublishableKey,'sb_publishable_fixture');assert.equal(JSON.stringify(value).includes('SESSION_VAULT_KEY'),false);assert.equal(JSON.stringify(value).includes('MCP_OWNER'),false);
 assert.equal((await handle(request('/api/account','GET',null,null),env,{},backend)).status,401);
});
test('only the designated provider may link or use MCP, including an old collaborator vault link',async()=>{
 const env=environment();
 const collaborator=async(url,options)=>String(url).includes('/token?')?Response.json({...session,expires_in:3600}):Response.json({id:'collaborator',email:'collaborator@example.test'});
 await assert.rejects(linkAccount(env,'site-b',{access_token:'collab-access',refresh_token:'collab-refresh'},collaborator),/reserved for the app provider/);assert.equal(env.data.size,0);
 await writeLink(env,'site-b',{...session,user_id:'collaborator'});
 const rpc=request('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_storyboards',arguments:{}}},'site-b');
 const result=await (await handle(rpc,env,{},collaborator)).json();assert.equal(result.result.isError,true);assert.match(result.result.content[0].text,/reserved for the app provider/);
 const missing=environment();delete missing.MCP_OWNER_SUPABASE_USER_ID;await assert.rejects(linkAccount(missing,'site-a',{access_token:'a',refresh_token:'b'},backend),/reserved/);
});
test('provider connection status validates a Supabase token; collaborators cannot reveal owner tools',async()=>{
 const env=environment();
 assert.equal((await handle(request('/api/mcp-status','GET',null,null),env,{},backend)).status,401);
 const owner=request('/api/mcp-status','GET',null,null);owner.headers.set('Authorization','Bearer owner-token');
 const state=await (await handle(owner,env,{},backend)).json();assert.deepEqual(state,{owner:true,chatgpt_signed_in:false,linked:false});
 const denied=await handle(owner,env,{},async()=>Response.json({id:'collaborator'}));assert.equal(denied.status,403);
});
test('Worker requests use manual redirects and reject redirects without following credentials',async()=>{
 const {authRequest}=await import('../server/account-vault.mjs');
 const {createToolClient}=await import('../server/storyboard-tools.mjs');
 const {connectionStatus}=await import('../server/connection-status.mjs');
 const env=environment();const calls=[];
 const edgeFetch=async(url,options)=>{
  calls.push({url:String(url),options});
  if(options.redirect==='error')throw new TypeError('Invalid redirect value: error');
  assert.equal(options.redirect,'manual');
  return Response.json({id:'db-a'});
 };
 await authRequest(env,'user',null,'test-user-token',edgeFetch);
 await createToolClient({supabaseUrl:env.SUPABASE_URL,supabasePublishableKey:env.SUPABASE_PUBLISHABLE_KEY},'test-user-token',edgeFetch).user();
 const probe=await connectionStatus(request('/mcp'),env,edgeFetch);assert.equal(probe.auth_reachable,true);
 assert.equal(calls.length,3);
 let redirects=0;await assert.rejects(authRequest(env,'user',null,'test-user-token',async(url,options)=>{redirects++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://untrusted.example'}});}),/Reconnect/);assert.equal(redirects,1);
});
