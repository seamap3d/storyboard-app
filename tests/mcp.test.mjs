import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMcp } from '../netlify/functions/storyboard-mcp.mjs';
import { runTool } from '../server/storyboard-tools.mjs';
const id='cae28003-b2f1-4ba2-9075-20ed454e9f50',project='504e737e-ce39-4eb3-80f9-c194a89a6e17';
const env={APP_ENV:'development',CONTEXT:'deploy-preview',DEPLOY_PRIME_URL:'https://preview.example',SUPABASE_URL:'https://dev.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
const request=(method,params)=>({httpMethod:'POST',path:'/mcp',headers:{'content-type':'application/json',authorization:'Bearer test-user-token'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
function fixture({role='owner',existing=false,conflict=false}={}){
  const board={id,project_id:project,name:'AfterLife',version:3,document:{meta:{title:'keep'},planning:{requirements:[{notes:'keep'}]},shots:[{id:'shot-1',desc:'keep',...(existing?{imagePath:'existing'}:{})},{id:'shot-2',notes:'untouched'}]}};
  const uploads=[],saves=[];
  return {board,uploads,saves,client:{list:async table=>table==='storyboards'?[structuredClone(board)]:table==='film_projects'?[{owner_id:role==='owner'?'user':'other'}]:[{role}],uploadImage:async(...args)=>uploads.push(args),rpc:async(name,args)=>{if(conflict){const e=new Error('conflict');e.code='40001';throw e;}saves.push(args);return {id,version:4};}}};
}
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfUQAAAAASUVORK5CYII=';
const attach={storyboard_id:id,shot_id:'shot-1',expected_revision:3,image_data_url:png};
test('MCP denies anonymous/invalid authentication, production, and foreign browser origins',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return Response.json({message:'invalid'},{status:401});};
  const req=request('tools/list');delete req.headers.authorization;
  assert.equal((await handleMcp(req,env,fetcher)).statusCode,401);assert.equal(calls,0);
  assert.equal((await handleMcp(request('tools/list'),env,fetcher)).statusCode,401);
  assert.equal((await handleMcp(req,{...env,CONTEXT:'production'},fetcher)).statusCode,404);
  req.headers.origin='https://evil.example';assert.equal((await handleMcp(req,env,fetcher)).statusCode,403);
});
test('MCP discovery, protocol handshake and tool catalog expose no private configuration',async()=>{
  const meta=await handleMcp({httpMethod:'GET',path:'/.well-known/oauth-protected-resource'},env);
  assert.equal(JSON.parse(meta.body).resource,'https://preview.example/mcp');assert.equal(meta.body.includes('fixture'),false);
  const fetcher=async()=>Response.json({id:'user'});
  const init=JSON.parse((await handleMcp(request('initialize',{protocolVersion:'2025-06-18'}),env,fetcher)).body);
  assert.equal(init.result.protocolVersion,'2025-06-18');
  const catalog=JSON.parse((await handleMcp(request('tools/list'),env,fetcher)).body);
  assert.equal(catalog.result.tools.length,3);
  assert.equal(catalog.result.tools[2].annotations.destructiveHint,true);
});
test('attach preserves the whole document, uses private content-addressed storage and expected revision',async()=>{
  const f=fixture();const result=await runTool(f.client,{id:'user'},'attach_shot_image',attach);
  assert.equal(result.revision,4);assert.equal(f.uploads.length,1);assert.match(f.uploads[0][0],new RegExp('^'+project+'/'+id+'/[a-f0-9]{64}\\.png$'));
  assert.equal(f.saves[0].p_version,3);assert.deepEqual(f.saves[0].p_document.planning,f.board.document.planning);
  assert.deepEqual(f.saves[0].p_document.shots[1],f.board.document.shots[1]);assert.equal(f.saves[0].p_document.shots[0].imageData,undefined);
});
test('viewers, stale revisions, unknown shots and implicit replacement fail before upload',async()=>{
  for(const [settings,args] of [[{role:'viewer'},attach],[{}, {...attach,expected_revision:2}],[{}, {...attach,shot_id:'missing'}],[{existing:true},attach]]){
    const f=fixture(settings);await assert.rejects(runTool(f.client,{id:'user'},'attach_shot_image',args));assert.equal(f.uploads.length,0);assert.equal(f.saves.length,0);
  }
  const f=fixture({existing:true});await runTool(f.client,{id:'user'},'attach_shot_image',{...attach,replace_existing:true});assert.equal(f.saves.length,1);
});
test('invalid bytes, arbitrary URLs and forged arguments cannot write; save conflicts propagate',async()=>{
  for(const args of [{...attach,image_data_url:'data:image/png;base64,aGVsbG8='},{...attach,image_data_url:undefined,image_url:'https://127.0.0.1/a.png'},{...attach,replace_existing:'true'},{...attach,unexpected:'value'}]){
    const f=fixture();await assert.rejects(runTool(f.client,{id:'user'},'attach_shot_image',args));assert.equal(f.uploads.length,0);
  }
  const f=fixture({conflict:true});await assert.rejects(runTool(f.client,{id:'user'},'attach_shot_image',attach),e=>e.code==='40001');assert.equal(f.saves.length,0);
});
test('HTTP tools use the verified user token for RLS requests, never an admin key',async()=>{
  const calls=[];const fetcher=async(url,options)=>{
    calls.push({url:String(url),headers:options.headers});
    return Response.json(String(url).endsWith('/auth/v1/user')?{id:'user'}:[{id,name:'Visible storyboard',version:3}]);
  };
  const result=JSON.parse((await handleMcp(request('tools/call',{name:'list_storyboards',arguments:{}}),env,fetcher)).body);
  assert.equal(result.result.structuredContent.storyboards[0].id,id);
  assert.equal(calls.length,2);
  for(const call of calls){assert.equal(call.headers.Authorization,'Bearer test-user-token');assert.equal(call.headers.apikey,'sb_publishable_fixture');}
});
test('hidden boards disclose no shots or image content and cannot be attached',async()=>{
  const client={list:async()=>[]};
  for(const name of ['get_storyboard','attach_shot_image'])await assert.rejects(runTool(client,{id:'user'},name,name==='get_storyboard'?{storyboard_id:id}:attach),/not found or access denied/);
});
