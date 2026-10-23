import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSharedDocument,loadSharedImages,portableDocument,validateStoryboard,decodeImage} from '../storyboard-media.mjs';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const project='00000000-0000-0000-0000-000000000001',board='00000000-0000-0000-0000-000000000002';
test('media saves private references without mutating original fields or uploading duplicate images',async()=>{
 const uploads=[];const doc={meta:{title:'Film'},layout:{columns:2},sceneColors:{one:'#fff'},shots:[{id:'one',customTitle:'A custom title',imageData:image},{id:'two',imageData:image}]};
 const result=await prepareSharedDocument({uploadImage:async(path,blob)=>uploads.push({path,blob})},doc,project,board);
 assert.equal(uploads.length,1);assert.equal(result.shots[0].imageData,undefined);assert.match(result.shots[0].imagePath,/\/[^/]{64}\.png$/);
 assert.equal(result.shots[0].imagePath,result.shots[1].imagePath);assert.equal(doc.shots[0].imageData,image);assert.deepEqual(result.layout,doc.layout);assert.equal(result.shots[0].customTitle,'A custom title');
 const downloads=[];const loaded=await loadSharedImages({downloadImage:async path=>{downloads.push(path);return decodeImage(image);}},result,project,board);
 assert.equal(downloads.length,1);assert.equal(loaded.shots[0].imageData,image);assert.equal(portableDocument(loaded).shots[0].imagePath,undefined);
});
test('failed upload keeps all source images and metadata available for retry/export',async()=>{
 const doc={meta:{},shots:[{id:'one',imageData:image}]};
 await assert.rejects(prepareSharedDocument({uploadImage:async()=>{throw new Error('Offline');}},doc,project,board),/Offline/);
 assert.equal(doc.shots[0].imageData,image);assert.equal(doc.shots[0].imagePath,undefined);
});
test('invalid imports, foreign image paths and over-limit images fail before replacing content',async()=>{
 assert.throws(()=>validateStoryboard({unrelated:'file'}),/shots array/);
 assert.throws(()=>validateStoryboard({shots:[{id:'same'},{id:'same'}]}),/unique/);
 assert.throws(()=>decodeImage('data:image/png;base64,'+Buffer.alloc(6*1024*1024).toString('base64')),/per-image limit/);
 await assert.rejects(loadSharedImages({}, {meta:{},shots:[{imagePath:'other-project/board/image.png'}]},project,board),/another storyboard/);
});
test('metadata limit is checked before any network upload',async()=>{
 let uploads=0;const doc={meta:{notes:'x'.repeat(6*1024*1024)},shots:[{imageData:image}]};
 await assert.rejects(prepareSharedDocument({uploadImage:async()=>uploads++},doc,project,board),/document limit/);assert.equal(uploads,0);
});
