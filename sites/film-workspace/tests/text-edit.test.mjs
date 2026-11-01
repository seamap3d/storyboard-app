import test from 'node:test';
import assert from 'node:assert/strict';
import {runTool} from '../server/storyboard-tools.mjs';
const id='cae28003-b2f1-4ba2-9075-20ed454e9f50';
const params={storyboard_id:id,shot_id:'last-shot',expected_revision:5,changes:{title:'EXT. RURAL ROAD – DAWN',scene:'EXT. RURAL ROAD – DAWN',description:'The pickup drives into the sunrise.'}};
function fixture(role='owner',conflict=false){
 const document={meta:{title:'AfterLife',custom:'preserve'},sceneColors:{old:'#fff'},layout:'landscape',planning:{requirements:[{name:'Case',notes:'keep'}]},shots:[{id:'first-shot',desc:'Leave me alone',imagePath:'image-one'},{id:'last-shot',customTitle:'INT. TRUCK',scene:'INT. TRUCK',desc:'Original dialogue',imagePath:'private-hash.png',imageCaption:'Approved image',customField:{keep:true},props:'Case'}]};
 const board={id,project_id:'project',name:'AfterLife',version:5,document};const saves=[];
 const client={list:async table=>table==='storyboards'?[structuredClone(board)]:table==='film_projects'?[{owner_id:role==='owner'?'user':'other'}]:[{role}],rpc:async(name,args)=>{assert.equal(name,'save_storyboard');if(conflict){const e=new Error('Changed elsewhere');e.code='40001';throw e;}saves.push(args);return {id,version:6};}};
 return {client,saves,board};
}
test('text edit updates only requested fields while preserving images, extra fields and the full document',async()=>{
 const f=fixture();const original=structuredClone(f.board.document);
 const result=await runTool(f.client,{id:'user'},'update_shot',params);
 assert.equal(result.changed,true);assert.equal(result.revision,6);assert.deepEqual(result.updated_fields,['title','scene','description']);
 assert.equal(f.saves[0].p_version,5);assert.equal(f.saves[0].p_name,'AfterLife');
 const expected=structuredClone(original);Object.assign(expected.shots[1],{customTitle:params.changes.title,scene:params.changes.scene,desc:params.changes.description});
 assert.deepEqual(f.saves[0].p_document,expected);assert.deepEqual(f.board.document,original);assert.equal(result.shot.has_image,true);
});
test('editor writes are permitted; viewer/commenter and missing/ambiguous shots cannot save',async()=>{
 const editor=fixture('editor');await runTool(editor.client,{id:'user'},'update_shot',params);assert.equal(editor.saves.length,1);
 for(const role of ['viewer','commenter']){const f=fixture(role);await assert.rejects(runTool(f.client,{id:'user'},'update_shot',params),/Editing access/);assert.equal(f.saves.length,0);}
 for(const duplicate of [false,true]){const f=fixture();if(duplicate)f.board.document.shots.push(structuredClone(f.board.document.shots[1]));else f.board.document.shots[1].id='different';await assert.rejects(runTool(f.client,{id:'user'},'update_shot',params),/Shot not found or ambiguous/);assert.equal(f.saves.length,0);}
});
test('stale reads and a racing save fail without retry or mutating source content',async()=>{
 const old=fixture();await assert.rejects(runTool(old.client,{id:'user'},'update_shot',{...params,expected_revision:4}),/Storyboard changed/);assert.equal(old.saves.length,0);
 const racing=fixture('owner',true);const before=structuredClone(racing.board.document);await assert.rejects(runTool(racing.client,{id:'user'},'update_shot',params),e=>e.code==='40001');assert.deepEqual(racing.board.document,before);assert.equal(racing.saves.length,0);
});
test('no-op edits do not increment revision; empty strings clear only explicitly supplied fields',async()=>{
 const f=fixture();const same=await runTool(f.client,{id:'user'},'update_shot',{...params,changes:{description:'Original dialogue'}});assert.equal(same.changed,false);assert.equal(same.revision,5);assert.equal(f.saves.length,0);
 await runTool(f.client,{id:'user'},'update_shot',{...params,changes:{props:''}});assert.equal(f.saves[0].p_document.shots[1].props,'');assert.equal(f.saves[0].p_document.shots[1].imagePath,'private-hash.png');assert.equal(f.saves[0].p_document.shots[1].desc,'Original dialogue');
});
test('invalid, arbitrary or protected-field patches are rejected before any database request',async()=>{
 let reads=0;const client={list:async()=>{reads++;throw Error('Unexpected request');}};
 const invalid=[{},[],null,{imagePath:'other'},{id:'replace-id'},{image_data_url:'data:wrong'},{description:null},{notes:12},{title:'x'.repeat(251)},{shoot_date:'2026-02-30'},{shoot_date:'tomorrow'},JSON.parse('{"__proto__":{"polluted":true}}')];
 for(const changes of invalid)await assert.rejects(runTool(client,{id:'user'},'update_shot',{...params,changes}),/Text update/);
 for(const expected_revision of [0,-1,1.5,'5'])await assert.rejects(runTool(client,{id:'user'},'update_shot',{...params,expected_revision}),/current revision/);
 assert.equal(reads,0);assert.equal({}.polluted,undefined);
});
test('all exposed text fields map to existing shot fields and remain readable',async()=>{
 const f=fixture();const changes={location:'Beach',cast:'Gwendryth',props:'Case',equipment:'Tripod',notes:'Hold the final frame',shot_type:'Wide',lens:'35mm',camera_movement:'Tracking',shoot_date:'2026-11-20'};
 const result=await runTool(f.client,{id:'user'},'update_shot',{...params,changes});for(const [k,v] of Object.entries(changes))assert.equal(result.shot[k],v);
 assert.equal(f.saves[0].p_document.shots[1].chars,'Gwendryth');assert.equal(f.saves[0].p_document.shots[1].move,'Tracking');
});
