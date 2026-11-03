import test from 'node:test';
import assert from 'node:assert/strict';
import { runTool } from '../server/storyboard-tools.mjs';

const storyboardId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfUQAAAAASUVORK5CYII=',
  'base64',
);
const image = 'data:image/png;base64,' + png.toString('base64');
function fixture() {
  const board = {
    id: storyboardId,
    project_id: projectId,
    name: 'Film',
    version: 3,
    document: {
      meta: { custom: 'keep' },
      otherRoot: true,
      shots: [
        { id: 'shot', customField: 'keep' },
        { id: 'untouched', desc: 'preserve' },
      ],
    },
  };
  const writes = [],
    uploads = [];
  const client = {
    list: async (table) => (table === 'storyboards' ? [board] : [{ owner_id: 'owner' }]),
    uploadImage: async (path, blob) =>
      uploads.push({ path, bytes: Buffer.from(await blob.arrayBuffer()) }),
    rpc: async (name, args) => {
      writes.push({ name, args });
      return { id: board.id, version: 4 };
    },
  };
  const args = { storyboard_id: storyboardId, shot_id: 'shot', expected_revision: 3 };
  return { board, client, args, writes, uploads };
}

test('MCP image attachment preserves metadata and other shots and uploads the original bytes', async () => {
  const { board, client, args, writes, uploads } = fixture();
  const before = structuredClone(board);
  const result = await runTool(client, { id: 'owner' }, 'attach_shot_image', {
    ...args,
    image_data_url: image,
    caption: 'Approved frame',
  });
  assert.equal(result.attached, true);
  assert.equal(result.revision, 4);
  assert.deepEqual(board, before);
  assert.equal(uploads.length, 1);
  assert.deepEqual(uploads[0].bytes, png);
  const saved = writes[0].args;
  assert.equal(saved.p_version, 3);
  assert.equal(saved.p_document.meta.custom, 'keep');
  assert.equal(saved.p_document.shots[0].customField, 'keep');
  assert.equal(saved.p_document.shots[0].imageCaption, 'Approved frame');
  assert.equal(saved.p_document.shots[0].imageData, undefined);
  assert.equal(saved.p_document.shots[0].imagePath, uploads[0].path);
  assert.deepEqual(saved.p_document.shots[1], before.document.shots[1]);
});

test('URL images use an allowlisted host without redirects and reject wrong content before writing', async () => {
  const { client, args, uploads, writes } = fixture();
  const url = 'https://files.oaiusercontent.com/approved.png';
  await runTool(
    client,
    { id: 'owner' },
    'attach_shot_image',
    { ...args, image_url: url },
    async (input, options) => {
      assert.equal(String(input), url);
      assert.equal(options.redirect, 'manual');
      return new Response(png, { headers: { 'Content-Type': 'image/png' } });
    },
  );
  assert.equal(uploads.length, 1);
  assert.equal(writes.length, 1);
  const rejected = fixture();
  await assert.rejects(
    runTool(
      rejected.client,
      { id: 'owner' },
      'attach_shot_image',
      { ...rejected.args, image_url: url },
      async () => new Response('wrong bytes', { headers: { 'Content-Type': 'image/png' } }),
    ),
    /File content/,
  );
  assert.equal(rejected.uploads.length, 0);
  assert.equal(rejected.writes.length, 0);
});

test('existing images need explicit replacement; invalid sources cannot upload or save', async () => {
  const f = fixture();
  f.board.document.shots[0].imagePath = 'existing';
  await assert.rejects(
    runTool(f.client, { id: 'owner' }, 'attach_shot_image', { ...f.args, image_data_url: image }),
    /already has an image/,
  );
  assert.equal(f.uploads.length, 0);
  assert.equal(f.writes.length, 0);
  for (const image_url of [
    'http://files.oaiusercontent.com/a.png',
    'https://example.test/a.png',
    'https://files.oaiusercontent.com:444/a.png',
  ]) {
    await assert.rejects(
      runTool(
        f.client,
        { id: 'owner' },
        'attach_shot_image',
        { ...f.args, replace_existing: true, image_url },
        () => {
          throw Error('Must not fetch');
        },
      ),
      /Only HTTPS/,
    );
  }
  assert.equal(f.uploads.length, 0);
  assert.equal(f.writes.length, 0);
});

test('an upstream redirect cannot be followed or saved as an image', async () => {
  const { client, args, uploads, writes } = fixture();
  let requests = 0;
  await assert.rejects(
    runTool(
      client,
      { id: 'owner' },
      'attach_shot_image',
      { ...args, image_url: 'https://files.oaiusercontent.com/frame.png' },
      async () => {
        requests++;
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://example.test/private' },
        });
      },
    ),
    /could not be downloaded/,
  );
  assert.equal(requests, 1);
  assert.equal(uploads.length, 0);
  assert.equal(writes.length, 0);
});
