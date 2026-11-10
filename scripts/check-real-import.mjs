// Run against an owner-provided fixture, never committed or uploaded by this test.
// HTTP Storage/PostgREST are stubbed; SQL authorization is tested separately.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const filename=process.env.STORYBOARD_IMPORT_FILE;
if(!filename)throw new Error('Set STORYBOARD_IMPORT_FILE to the original JSON path.');
const source=JSON.parse(await readFile(filename,'utf8'));
const projectId='10000000-0000-0000-0000-000000000001',boardId='20000000-0000-0000-0000-000000000001';
const board={id:boardId,project_id:projectId,name:'Import reproduction',version:1,document:{meta:{},shots:[]}};
const files=new Map();let failUploads=false,saveCalls=0;
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;const name=path==='/'?'index.html':path.slice(1);if(!/^(index\.html|styles\.css|runtime-config\.json|[a-z-]+\.mjs)$/.test(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.mjs')?'text/javascript':name.endsWith('.json')?'application/json':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(new URL('../dist/'+name,import.meta.url)));}catch{res.writeHead(500).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
const imageHashes=doc=>doc.shots.filter(s=>s.imageData).map(s=>createHash('sha256').update(Buffer.from(s.imageData.split(',')[1],'base64')).digest('hex'));
function assertPreserved(doc){
 assert.equal(doc.shots.length,source.shots.length);assert.deepEqual(doc.shots.map(s=>s.id),source.shots.map(s=>s.id));
 for(const key of ['layout','activeTab','sceneColors'])if(key in source)assert.deepEqual(doc[key],source[key]);
 assert.deepEqual(doc.meta,source.meta);assert.deepEqual(doc.shots.map(s=>s.customTitle),source.shots.map(s=>s.customTitle));
 assert.deepEqual(imageHashes(doc),imageHashes(source));
 for(let i=0;i<source.shots.length;i++)for(const key of ['scene','desc','chars','location','shootDate','equipment','props','notes','type','lens','move'])assert.equal(doc.shots[i][key]??'',source.shots[i][key]??'',`shot ${i} ${key}`);
}
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 const page=await browser.newPage();page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(!url.hostname.endsWith('.supabase.co')){await route.abort();return;}
  const headers={'Access-Control-Allow-Origin':'*'};
  if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:{...headers,'Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});return;}
  let result;
  if(url.pathname.startsWith('/storage/v1/object/')){
   const path=url.pathname.split('storyboard-images/')[1];
   assert.equal(request.headers().authorization,'Bearer fixture');
   if(request.method()==='POST'){
    if(failUploads){await route.fulfill({status:503,headers,json:{message:'Fixture upload unavailable'}});return;}
    files.set(path,{bytes:request.postDataBuffer(),type:request.headers()['content-type']});
    await route.fulfill({headers,json:{Key:path}});return;
   }
   const file=files.get(path);if(!file){await route.fulfill({status:404,headers,json:{message:'Missing image'}});return;}
   await route.fulfill({headers,contentType:file.type,body:file.bytes});return;
  }
  const body=request.postDataJSON();
  if(url.pathname==='/auth/v1/token')result={access_token:'fixture',refresh_token:'fixture-refresh',expires_in:3600};
  else if(url.pathname==='/auth/v1/user')result={id:'owner',email:'owner@example.test'};
  else if(url.pathname==='/rest/v1/film_projects')result=[{id:projectId,name:'Fixture film',owner_id:'owner'}];
  else if(url.pathname==='/rest/v1/project_members'||url.pathname==='/rest/v1/project_invitations')result=[];
  else if(url.pathname==='/rest/v1/storyboards')result=[board];
  else if(url.pathname==='/rest/v1/rpc/save_storyboard'){
   saveCalls++;assert.equal(body.p_version,board.version);
   assert.ok(Buffer.byteLength(JSON.stringify(body.p_document))<5*1024*1024);
   assert.ok(body.p_document.shots.every(s=>!s.imageData));
   Object.assign(board,{document:body.p_document,name:body.p_name,version:board.version+1});result=board;
  }else throw new Error('Unexpected endpoint '+url.pathname);
  await route.fulfill({headers,json:result});
 });
 const origin='http://127.0.0.1:'+server.address().port;
 await page.goto(origin);
 await page.locator('#fileInput').setInputFiles(filename);
 await page.waitForFunction(n=>document.querySelectorAll('.shot').length===n&&!window.storyboard.localUnsaved,source.shots.length,{timeout:90000});
 assertPreserved(await page.evaluate(()=>window.storyboard.collectData()));
 await page.reload();await page.waitForFunction(n=>document.querySelectorAll('.shot').length===n,source.shots.length,{timeout:90000});
 assertPreserved(await page.evaluate(()=>window.storyboard.collectData()));
 await page.locator('#accountEmail').fill('owner@example.test');await page.locator('#accountPassword').fill('fixture-password');await page.locator('#authForm button[type=submit]').click();
 await page.waitForFunction(()=>document.getElementById('projectSelect').options.length===2);
 await page.selectOption('#projectSelect',projectId);await page.waitForFunction(()=>document.getElementById('sharedStatus').textContent.includes('0 shots'));
 await page.locator('#fileInput').setInputFiles(filename);await page.waitForFunction(n=>document.querySelectorAll('.shot').length===n,source.shots.length);
 failUploads=true;await page.locator('#cloudSave').click();await page.waitForFunction(()=>document.getElementById('sharedStatus').textContent.includes('Fixture upload unavailable'));
 assert.equal(board.version,1);assert.equal(saveCalls,0);assertPreserved(await page.evaluate(()=>window.storyboard.collectData()));
 failUploads=false;await page.locator('#cloudSave').click();await page.waitForFunction(()=>document.getElementById('sharedStatus').textContent.includes('version 2'),null,{timeout:120000});
 assert.ok(files.size>0);assert.equal(board.document.shots.length,source.shots.length);
 await page.reload();await page.waitForFunction(()=>document.getElementById('projectSelect').options.length===2);await page.selectOption('#projectSelect',projectId);
 await page.waitForFunction(n=>document.querySelectorAll('.shot').length===n&&document.getElementById('sharedStatus').textContent.includes(n+' shots'),source.shots.length,{timeout:120000});
 assertPreserved(await page.evaluate(()=>window.storyboard.collectData()));
 const downloadPromise=page.waitForEvent('download');await page.locator('#btnExport').click();const download=await downloadPromise;
 const exported=JSON.parse(await readFile(await download.path(),'utf8'));assertPreserved(exported);assert.ok(exported.shots.every(s=>!s.imagePath));
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'passed',shots:source.shots.length,images:source.shots.filter(s=>s.imageData).length,uniquePrivateUploads:files.size,sharedJsonBytes:Buffer.byteLength(JSON.stringify(board.document)),checks:['exact-file import','IndexedDB reload','failed upload preserves original','private upload/reference save','shared reload','portable export','image hashes and metadata preserved']}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
