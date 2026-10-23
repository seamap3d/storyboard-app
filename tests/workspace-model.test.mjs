import test from 'node:test';
import assert from 'node:assert/strict';
import {collectRequirements,filterShots,csv} from '../workspace-model.mjs';
test('requirements consolidate repeated mentions while keeping props/equipment distinct',()=>{
 const doc={shots:[{id:'a',scene:'INT. ROOM',props:'Cup, cup; Chair',equipment:'Camera\nCup'},{id:'b',scene:'EXT. BEACH',props:'CUP',equipment:'Camera'}]};
 const rows=collectRequirements(doc),cup=rows.find(r=>r.key==='prop:cup');
 assert.equal(cup.shots.length,2);assert.equal(rows.length,4);assert.equal(rows.find(r=>r.key==='equipment:camera').shots.length,2);
 assert.equal(cup.quantity,''); // Never infer inventory quantities from mention count.
});
test('manual logistics survive removal of their last shot reference',()=>{
 const doc={planning:{requirements:[{id:'stable-item',kind:'prop',name:'Cup',quantity:3,providedBy:'Crew',readiness:'ready',notes:'Keep spare'}]},shots:[]};
 const [item]=collectRequirements(doc);assert.equal(item.id,'stable-item');assert.equal(item.quantity,3);assert.equal(item.shots.length,0);assert.equal(item.notes,'Keep spare');
});
test('shot filters and sorting preserve source order and shot identities',()=>{
 const shots=[{id:'first',scene:'Z',location:'Beach',props:'Cup',status:'ready'},{id:'second',scene:'A',location:'Room'}];
 assert.deepEqual(filterShots(shots,{search:'cup',status:'ready'}).map(s=>s.id),['first']);
 assert.deepEqual(filterShots(shots,{sort:'scene'}).map(s=>s.id),['second','first']);assert.equal(shots[0].id,'first');
 assert.deepEqual(filterShots(shots,{location:'Room',status:'planned'}).map(s=>s.displayNumber),[2]);
});
test('CSV quotes fields and neutralizes spreadsheet formulas',()=>{
 const output=csv([['=1+1','a,"b"',3]]);assert.ok(output.includes('"\'=1+1"'));assert.ok(output.includes('"a,""b"""'));assert.ok(output.includes('"3"'));
});
