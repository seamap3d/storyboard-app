// Local browser workflow checks with a stubbed Supabase HTTP API.
// Backend authorization is independently tested by scripts/test-db.sh.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;const name=path==='/'?'index.html':path.slice(1);if(!['index.html','styles.css','shared-ui.mjs','shared-client.mjs','local-draft.mjs','runtime-config.json'].includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.mjs')?'text/javascript':name.endsWith('.json')?'application/json':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(new URL('../dist/'+name,import.meta.url)));}catch{res.writeHead(500).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message)); page.on('console',msg=>{if(msg.type()==='error') console.error('Browser console:',msg.text());});
 const user={id:'user-owner',email:'owner@example.test'};
 const projects=[{id:'project-1',name:'Film One',owner_id:user.id},{id:'project-2',name:'Film Two',owner_id:user.id}];
 let conflict=false,saveRequests=0;
 const boards=[{id:'board-1',project_id:'project-1',name:'Opening',document:{meta:{title:'Shared One'},shots:[]},version:1},{id:'board-2',project_id:'project-1',name:'Ending',document:{meta:{title:'Shared Two'},shots:[]},version:1}];
 await page.route('https://**/*',async route=>{
  const u=new URL(route.request().url());if(!u.hostname.endsWith('.supabase.co')){await route.abort();return;}
  if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});return;}
  const body=route.request().postDataJSON(); let result;
  if(u.pathname==='/auth/v1/token')result={access_token:'fixture',refresh_token:'fixture-refresh',expires_in:3600};
  else if(u.pathname==='/auth/v1/user')result=user;
  else if(u.pathname==='/auth/v1/logout')result={};
  else if(u.pathname==='/rest/v1/film_projects')result=projects;
  else if(u.pathname==='/rest/v1/project_members')result=user.id==='user-viewer'?[{project_id:'project-1',user_id:user.id,email:user.email,role:'viewer'}]:[];
  else if(u.pathname==='/rest/v1/project_invitations')result=[];
  else if(u.pathname==='/rest/v1/storyboards')result=boards.filter(b=>(!u.searchParams.has('id')||'eq.'+b.id===u.searchParams.get('id'))&&(!u.searchParams.has('project_id')||'eq.'+b.project_id===u.searchParams.get('project_id')));
  else if(u.pathname==='/rest/v1/rpc/save_storyboard'){
   saveRequests++;
   if(conflict){await route.fulfill({status:400,headers:{'Access-Control-Allow-Origin':'*'},json:{code:'40001'}});return;}
   result=boards.find(b=>b.id===body.p_id);Object.assign(result,{document:body.p_document,name:body.p_name,version:result.version+1});
  } else if(u.pathname==='/rest/v1/rpc/create_storyboard'){
   result={id:'board-new',project_id:body.p_project,name:body.p_name,document:body.p_document,version:1};boards.push(result);
  }else {throw new Error('Unexpected API call '+u.pathname);}
  await route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:result});
 });
 const origin='http://127.0.0.1:'+server.address().port;
 await page.goto(origin);await page.locator('#projTitle').fill('Keep browser draft');await page.locator('#btnNew').click();
 await page.locator('.scene').fill('EXT. LOCAL BEACH');
 await page.waitForFunction(()=>!window.storyboard.localUnsaved);
 await page.reload();await page.waitForFunction(()=>document.getElementById('projTitle').value==='Keep browser draft');
 await page.locator('#accountEmail').fill(user.email);await page.locator('#accountPassword').fill('test-password');await page.locator('#authForm button[type=submit]').click();
 await page.waitForFunction(()=>document.getElementById('projectSelect').options.length===3).catch(async e=>{console.error(await page.locator('#sharedStatus').textContent(),errors);throw e;});
 await page.selectOption('#projectSelect','project-1');await page.waitForFunction(()=>document.getElementById('projTitle').value==='Shared One');
 await page.locator('#btnNew').click();await page.locator('.scene').fill('EXT. SHARED FOREST');await page.locator('#cloudSave').click();
 await page.waitForFunction(()=>document.getElementById('sharedStatus').textContent.includes('version 2'));
 assert.equal(boards[0].document.shots[0].scene,'EXT. SHARED FOREST');
 await page.selectOption('#boardSelect','board-2');await page.waitForFunction(()=>document.getElementById('projTitle').value==='Shared Two');
 assert.equal(await page.locator('.shot').count(),0);
 await page.selectOption('#boardSelect','board-1');await page.waitForFunction(()=>document.querySelector('.scene')?.value==='EXT. SHARED FOREST');
 conflict=true;await page.locator('.scene').fill('Conflicting local edit');await page.locator('#cloudSave').click();
 await page.waitForFunction(()=>document.getElementById('sharedStatus').textContent.includes('Another member saved'));
 assert.equal(await page.locator('.scene').inputValue(),'Conflicting local edit');assert.equal(boards[0].document.shots[0].scene,'EXT. SHARED FOREST');
 const beforeOversizedSave=saveRequests;
 const oversized={meta:{title:'Oversized shared import',notes:'x'.repeat(6*1024*1024)},shots:[]};
 await page.locator('#fileInput').setInputFiles({name:'oversized.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(oversized))});
 await page.waitForFunction(()=>document.getElementById('projTitle').value==='Oversized shared import');
 await page.locator('#cloudSave').click();
 await page.waitForFunction(()=>document.getElementById('sharedStatus').textContent.includes('5 MiB shared-save limit'));
 assert.equal(saveRequests,beforeOversizedSave);
 assert.equal(await page.locator('#projTitle').inputValue(),'Oversized shared import');
 page.on('dialog',d=>d.accept());
 await page.selectOption('#projectSelect','');await page.waitForFunction(()=>document.getElementById('projTitle').value==='Keep browser draft');
 assert.equal(await page.locator('.scene').inputValue(),'EXT. LOCAL BEACH');
 await page.selectOption('#projectSelect','project-2');await page.waitForFunction(()=>document.getElementById('sharedStatus').textContent.includes('No storyboards'));
 // Copy into a different project, without removing the original browser data.
 page.removeAllListeners('dialog');page.once('dialog',d=>d.accept('Copied local storyboard'));
 await page.locator('#copyLocal').click();await page.waitForFunction(()=>document.getElementById('boardName').value==='Copied local storyboard');
 assert.equal(await page.locator('.scene').inputValue(),'EXT. LOCAL BEACH');
 await page.reload();await page.waitForFunction(()=>document.getElementById('projectSelect').options.length===3);
 await page.selectOption('#projectSelect','project-2');await page.waitForFunction(()=>document.getElementById('boardName').value==='Copied local storyboard');
 assert.equal(await page.locator('.scene').inputValue(),'EXT. LOCAL BEACH');
 await page.locator('#signOut').click();await page.waitForFunction(()=>!document.getElementById('authForm').hidden);
 assert.equal(await page.locator('#projTitle').inputValue(),'Keep browser draft');
 assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).length),0);
 user.id='user-viewer';user.email='viewer@example.test';
 await page.locator('#accountEmail').fill(user.email);await page.locator('#accountPassword').fill('test-password');await page.locator('#authForm button[type=submit]').click();
 await page.waitForFunction(()=>document.getElementById('projectSelect').options.length===3);
 await page.selectOption('#projectSelect','project-1');await page.waitForFunction(()=>document.querySelector('.scene')?.value==='EXT. SHARED FOREST');
 assert.equal(await page.locator('#cloudSave').isDisabled(),true);assert.equal(await page.locator('.scene').isDisabled(),true);assert.equal(await page.locator('#btnNew').isDisabled(),true);
 assert.equal(await page.locator('#inviteForm').isVisible(),false);
 const count=await page.locator('.shot').count();await page.locator('body').press('n');assert.equal(await page.locator('.shot').count(),count);
 await page.locator('.btnToggleFold').click();await page.locator('.btnToggleFold').click();assert.equal(await page.locator('.scene').isVisible(),true);
 assert.equal(await page.locator('#btnExport').isEnabled(),true);
 // Verify migration, large-file persistence, and real write failures in Chromium.
 const draftContext=await browser.newContext();
 const draftPage=await draftContext.newPage();
 draftPage.on('pageerror',error=>errors.push(error.message));
 const draftDialogs=[];draftPage.on('dialog',async dialog=>{draftDialogs.push(dialog.type());await dialog.dismiss();});
 await draftPage.route('https://**/*',route=>route.abort());
 await draftPage.addInitScript(()=>localStorage.setItem('apeOnAWhaleStoryboard',JSON.stringify({meta:{title:'Legacy browser draft'},shots:[]})));
 await draftPage.goto(origin);
 await draftPage.waitForFunction(()=>document.getElementById('projTitle').value==='Legacy browser draft' && !window.storyboard.localUnsaved);
 const notes='x'.repeat(6*1024*1024);
 const large={meta:{title:'Large imported storyboard',notes},shots:[{id:'large-shot',scene:'EXT. IMPORTED BEACH'}]};
 assert.equal(await draftPage.evaluate(text=>{try{localStorage.setItem('quota-probe',text);return false;}catch(error){return error.name==='QuotaExceededError';}},notes),true);
 await draftPage.locator('#fileInput').setInputFiles({name:'large-storyboard.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(large))});
 await draftPage.waitForFunction(()=>document.getElementById('projTitle').value==='Large imported storyboard' && !window.storyboard.localUnsaved);
 assert.equal(await draftPage.locator('#projNotes').inputValue(),notes);
 await draftPage.reload();
 await draftPage.waitForFunction(()=>document.getElementById('projTitle').value==='Large imported storyboard');
 assert.equal(await draftPage.locator('#projNotes').inputValue(),notes);
 // Simulate a blocked/quota-exceeded IndexedDB write. Memory must remain current.
 await draftPage.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Fixture quota','QuotaExceededError');};});
 await draftPage.locator('#fileInput').setInputFiles({name:'unsaved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({meta:{title:'Unsaved imported draft'},shots:[]}))});
 await draftPage.waitForFunction(()=>document.getElementById('draftStatus').textContent.includes('could not be saved'));
 assert.equal(await draftPage.evaluate(()=>window.storyboard.localData().meta.title),'Unsaved imported draft');
 assert.equal(await draftPage.evaluate(()=>window.storyboard.localUnsaved),true);
 assert.equal(await draftPage.locator('#btnExport').isEnabled(),true);
 assert.deepEqual(draftDialogs,[]);
 await draftPage.evaluate(()=>{IDBObjectStore.prototype.put=window.originalPut;});
 await draftPage.locator('#projTitle').fill('Recovered imported draft');
 await draftPage.waitForFunction(()=>!window.storyboard.localUnsaved);
 await draftPage.reload();await draftPage.waitForFunction(()=>document.getElementById('projTitle').value==='Recovered imported draft');
 await draftContext.close();
 assert.deepEqual(errors,[]);
 console.log('Browser checks passed: local persistence, sign-in, multiple projects/boards, shared save/reload, conflict preservation, draft copy, sign-out isolation, viewer read-only controls, legacy migration, 6 MiB JSON reload, storage-failure preservation/recovery.');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
