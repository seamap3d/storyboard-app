import test from 'node:test';
import assert from 'node:assert/strict';
import {SharedClient} from '../shared-client.mjs';
const config={supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'sb_publishable_fixture'};
function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
test('authenticated requests refresh expired sessions and persist rotated tokens',async()=>{
 const calls=[],store=storage();
 const client=new SharedClient(config,{storage:store,fetcher:async(url,options)=>{calls.push({url,options});return url.includes('refresh_token')?response({access_token:'new',refresh_token:'rotated',expires_in:3600}):response([]);}});
 client.setSession({access_token:'old',refresh_token:'refresh',expires_at:1});
 await client.list('film_projects','select=*');
 assert.equal(calls.length,2);assert.equal(calls[1].options.headers.Authorization,'Bearer new');assert.equal(client.session.refresh_token,'rotated');
 assert.equal(new SharedClient(config,{storage:store}).session.access_token,'new');
});
test('failed refresh clears invalid session and does not issue a database request',async()=>{
 let count=0;const client=new SharedClient(config,{storage:storage(),fetcher:async()=>{count++;return response({message:'Expired'},400);}});
 client.setSession({access_token:'old',refresh_token:'refresh',expires_at:1});
 await assert.rejects(client.list('storyboards'),/Expired/);assert.equal(count,1);assert.equal(client.session,null);
});
test('conflicting save surfaces conflict without retry or overwrite',async()=>{
 let count=0;const client=new SharedClient(config,{storage:storage(),fetcher:async()=>{count++;return response({code:'40001'},400);}});
 client.setSession({access_token:'current',refresh_token:'refresh',expires_in:3600});
 await assert.rejects(client.rpc('save_storyboard',{p_version:1}),/Another member saved/);assert.equal(count,1);
});
test('logout clears this tab session even when the server is unavailable',async()=>{
 const client=new SharedClient(config,{storage:storage(),fetcher:async()=>{throw new Error('Offline');}});
 client.setSession({access_token:'current',expires_in:3600});await assert.rejects(client.signOut(),/Offline/);assert.equal(client.session,null);
 await assert.rejects(client.list('storyboards'),/Sign in/);
});
test('server-rejected access token refreshes once before retrying the request',async()=>{
 const calls=[];const client=new SharedClient(config,{storage:storage(),fetcher:async(url,options)=>{
  calls.push(url);
  if(url.includes('refresh_token'))return response({access_token:'new',refresh_token:'new-refresh',expires_in:3600});
  return options.headers.Authorization==='Bearer new'?response([{id:'allowed'}]):response({message:'JWT expired'},401);
 }});
 client.setSession({access_token:'old',refresh_token:'refresh',expires_in:3600});
 assert.deepEqual(await client.list('film_projects'),[{id:'allowed'}]);assert.equal(calls.length,3);
});
test('storyboard RPC accepts the single-row composite representation from PostgREST',async()=>{
 const client=new SharedClient(config,{storage:storage(),fetcher:async()=>response([{id:'board',version:2}])});
 client.setSession({access_token:'current',expires_in:3600});
 assert.deepEqual(await client.rpc('save_storyboard',{p_version:1}),{id:'board',version:2});
});
test('signup explicitly returns email confirmation to the originating app',async()=>{
 let request;const client=new SharedClient(config,{storage:storage(),fetcher:async(url,options)=>{request={url,options};return response({user:{id:'pending'}});}});
 const redirect='https://deploy-preview-3--storyboardafterlive.netlify.app/';
 await client.signUp('person@example.test','private-fixture-password',redirect);
 const url=new URL(request.url);
 assert.equal(url.pathname,'/auth/v1/signup');assert.equal(url.searchParams.get('redirect_to'),redirect);
 assert.equal(url.href.includes('private-fixture-password'),false);assert.equal(client.session,null);
});
