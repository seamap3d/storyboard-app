import test from 'node:test';
import assert from 'node:assert/strict';
import {SharedClient} from '../app/shared-client.mjs';
import {SitesClient} from '../app/sites-client.mjs';
import {prepareSharedDocument,imageDataUrl} from '../app/storyboard-media.mjs';
import {handle} from '../worker/index.mjs';
const config={supabaseUrl:'https://lfvsimzmjhceyvjaoats.supabase.co',supabasePublishableKey:'sb_publishable_fixture'};
const storage=()=>({getItem:()=>null,setItem(){},removeItem(){}});
function client(fetcher){const c=new SharedClient(config,{storage:storage(),fetcher});c.setSession({access_token:'actor-token',refresh_token:'refresh',expires_in:3600,user:{id:'actor'}});return c;}
const submission={p_id:'board',p_version:5,p_name:'AfterLife',p_document:{meta:{title:'Film'},shots:[{id:'last',desc:'Sunrise',imagePath:'private-hash.png'}]}};
test('all 19 loaded immutable images are reused without POSTing or redownloading on save',async()=>{
 const files=new Map(),shots=[];let uploads=0,downloads=0;const c=client(async(url,options)=>{
  if(options.method==='POST'){uploads++;throw Error('Images already exist');}
  downloads++;return new Response(files.get(url.split('/storyboard-images/')[1]),{headers:{'Content-Type':'image/png'}});
 });
 for(let i=0;i<19;i++){
  const blob=new Blob([new Uint8Array([137,80,78,71,13,10,26,10,i])],{type:'image/png'});
  const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());const hash=Buffer.from(digest).toString('hex');const path='project/board/'+hash+'.png';files.set(path,blob);
  const loaded=await c.downloadImage(path);shots.push({id:'shot-'+i,imagePath:path,imageData:await imageDataUrl(loaded)});
 }
 const document={meta:{},shots};const result=await prepareSharedDocument(c,document,'project','board');
 assert.equal(downloads,19);assert.equal(uploads,0);assert.equal(result.shots.length,19);assert.ok(result.shots.every(s=>s.imagePath&&!s.imageData));assert.ok(document.shots.every(s=>s.imageData));
});
test('save/upload/download budgets account for actual transfer and RPC time',async t=>{
 const budgets=[];t.mock.method(AbortSignal,'timeout',ms=>{budgets.push(ms);return new AbortController().signal;});
 const c=client(async(url)=>url.includes('/storage/')?new Response('image',{headers:{'Content-Type':'image/png'}}):Response.json([]));
 await c.list('storyboards');await c.downloadImage('path');await c.rpc('create_film_project',{p_name:'Film'});assert.deepEqual(budgets,[15000,60000,90000]);
});
test('a committed save with a lost response is confirmed by one read, never replayed',async()=>{
 let writes=0,reads=0;const saved={id:'board',name:'AfterLife',version:6,document:{shots:submission.p_document.shots,meta:submission.p_document.meta}};
 const c=client(async(url)=>{if(url.includes('/rpc/')){writes++;throw new DOMException('signal timed out','TimeoutError');}reads++;return Response.json([saved]);});
 const before=structuredClone(submission);assert.deepEqual(await c.rpc('save_storyboard',submission),saved);assert.equal(writes,1);assert.equal(reads,1);assert.deepEqual(submission,before);
});
test('an unconfirmed or different save preserves the draft and never claims success',async()=>{
 for(const different of [false,true]){
  let writes=0;const c=client(async(url)=>{if(url.includes('/rpc/')){writes++;return Response.json({code:'SAVE_UNCONFIRMED'},{status:504});}return Response.json([{id:'board',name:'AfterLife',version:different?6:5,document:different?{meta:{title:'Someone else'},shots:[]}:submission.p_document}]);});
  const before=structuredClone(submission);await assert.rejects(c.rpc('save_storyboard',submission),e=>e.code==='SAVE_UNCONFIRMED'&&/Export JSON/.test(e.message));assert.equal(writes,1);assert.deepEqual(submission,before);
 }
});
test('a retry after a late commit can recognize that exact save; real conflicts still fail',async()=>{
 for(const matches of [true,false]){
  let writes=0;const saved={id:'board',version:6,name:'AfterLife',document:matches?submission.p_document:{meta:{title:'Other'},shots:[]}};
  const c=client(async(url)=>{if(url.includes('/rpc/')){writes++;return Response.json({code:'40001'},{status:400});}return Response.json([saved]);});
  if(matches)assert.deepEqual(await c.rpc('save_storyboard',submission),saved);else await assert.rejects(c.rpc('save_storyboard',submission),e=>e.code==='40001');assert.equal(writes,1);
 }
});
test('image-transfer timeout is actionable and cannot mark the image cached',async()=>{
 const c=client(async()=>{throw new DOMException('signal timed out','TimeoutError');});await assert.rejects(c.downloadImage('missing'),e=>e.code==='REQUEST_TIMEOUT'&&/Export JSON|export JSON/.test(e.message));assert.equal(c.uploadedImages.size,0);
});
test('RPC relay uses caller JWT without ChatGPT and rejects arbitrary routes and foreign origins',async()=>{
 const env={SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:config.supabasePublishableKey};const calls=[];
 const backend=async(url,options)=>{calls.push({url,options});assert.equal(options.headers.Authorization,'Bearer actor-token');assert.equal(options.headers.apikey,config.supabasePublishableKey);assert.equal(options.redirect,'manual');return String(url).includes('/auth/')?Response.json({id:'actor'}):Response.json({id:'board',version:6});};
 const request=(path,headers={})=>new Request('https://site.test'+path,{method:'POST',headers:{Origin:'https://site.test','Content-Type':'application/json',Authorization:'Bearer actor-token',...headers},body:JSON.stringify(submission)});
 assert.equal((await handle(request('/api/project-rpc/save_storyboard'),env,{},backend)).status,200);assert.equal(calls.length,2);
 const relayed=JSON.parse(calls[1].options.body);assert.deepEqual(relayed,submission);
 assert.equal((await handle(request('/api/project-rpc/arbitrary_sql'),env,{},backend)).status,403);
 assert.equal((await handle(request('/api/project-rpc/save_storyboard',{Origin:'https://evil.test'}),env,{},backend)).status,403);
 assert.equal((await handle(request('/api/project-rpc/save_storyboard',{Authorization:''}),env,{},backend)).status,401);
});
test('RPC relay preserves server permission/conflict errors and reports lost confirmations',async()=>{
 const env={SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:config.supabasePublishableKey};
 for(const code of ['42501','40001','timeout']){
  let writes=0;const backend=async(url)=>{
   if(String(url).includes('/auth/'))return Response.json({id:'actor'});
   writes++;if(code==='timeout')throw new DOMException('timed out','TimeoutError');return Response.json({code},{status:code==='42501'?403:400});
  };
  const req=new Request('https://site.test/api/project-rpc/save_storyboard',{method:'POST',headers:{Origin:'https://site.test','Content-Type':'application/json',Authorization:'Bearer actor-token'},body:JSON.stringify(submission)});
  const response=await handle(req,env,{},backend);assert.equal((await response.json()).code,code==='timeout'?'SAVE_UNCONFIRMED':code);assert.equal(writes,1);
 }
});
test('Site client sends RPC to the same origin, but images and reads to Supabase',()=>{
 const c=client(async()=>Response.json([]));Object.setPrototypeOf(c,SitesClient.prototype);assert.equal(c.endpoint('/rest/v1/rpc/save_storyboard'),'/api/project-rpc/save_storyboard');assert.equal(c.endpoint('/rest/v1/storyboards'),config.supabaseUrl+'/rest/v1/storyboards');
 c.uploadedImages.add('private');c.setSession({access_token:'someone-else',expires_in:3600,user:{id:'other'}});assert.equal(c.uploadedImages.size,0);
});
