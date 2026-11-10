import test from 'node:test';
import assert from 'node:assert/strict';
import { runTool, toolDefinitions } from '../server/storyboard-tools.mjs';
import { emptyProduction } from '../app/production-model.mjs';
import { toolResult } from '../worker/mcp.mjs';
const project = '11111111-1111-4111-8111-111111111111';
const boardId = '22222222-2222-4222-8222-222222222222';
const character = '33333333-3333-4333-8333-333333333333';
const reference = '44444444-4444-4444-8444-444444444444';
const image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfUQAAAAASUVORK5CYII=';
function fixture() {
  let state = {
    project_id: project,
    version: 0,
    document: { ...emptyProduction(), custom: true },
    storyboards: [],
  };
  state.document.characters.push({ id: character, name: 'Synthetic character', unknown: 'keep' });
  const board = {
    id: boardId,
    project_id: project,
    version: 2,
    document: { shots: [{ id: 'shot', imageData: image }] },
  };
  const objects = new Map();
  let role = 'owner',
    saves = 0;
  const client = {
    list: async (table) =>
      table === 'storyboards'
        ? [board]
        : table === 'film_projects'
          ? [{ owner_id: role === 'owner' ? 'user' : 'other' }]
          : [{ role }],
    rpc: async (name, args) => {
      if (name === 'get_project_production') return structuredClone(state);
      assert.equal(args.p_version, state.version);
      state = { ...state, version: state.version + 1, document: args.p_document };
      saves++;
      return structuredClone(state);
    },
    uploadImage: async (path, blob) => objects.set(path, blob),
    downloadImage: async (path) => {
      if (!objects.has(path)) throw new Error('denied');
      return objects.get(path);
    },
  };
  const args = {
    project_id: project,
    storyboard_id: boardId,
    character_id: character,
    reference_id: reference,
    expected_revision: 0,
    approved: true,
    image_data_url: image,
  };
  const run = (name, input = args) => runTool(client, { id: 'user' }, name, input);
  return {
    run,
    args,
    board,
    objects,
    state: () => state,
    saves: () => saves,
    role: (value) => {
      role = value;
    },
  };
}
test('character bible uploads original bytes, preserves production data and returns MCP image blocks', async () => {
  const f = fixture();
  assert.ok(toolDefinitions.some((tool) => tool.name === 'get_character_bible'));
  const before = await f.run('get_character_bible', { project_id: project });
  assert.equal(before.characters[0].missing_reference, true);
  await f.run('attach_character_reference');
  assert.equal(f.saves(), 1);
  assert.equal(f.state().document.custom, true);
  assert.equal(f.state().document.characters[0].unknown, 'keep');
  const bible = await f.run('get_character_bible', { project_id: project });
  assert.equal(bible.characters[0].missing_reference, false);
  const value = await f.run('get_character_reference_image', {
    project_id: project,
    character_id: character,
    reference_id: reference,
  });
  const result = toolResult(value);
  assert.equal(result.content[1].type, 'image');
  assert.equal(result.content[1].data, image.split(',')[1]);
  assert.equal(result.structuredContent.revision, 1);
  assert.equal(JSON.stringify(result.structuredContent).includes('base64'), false);
  assert.equal(toolResult(bible).structuredContent, bible);
});
test('attachments reject unapproved, stale, read-only and replacement writes before uploading', async () => {
  const f = fixture();
  for (const patch of [
    { approved: false },
    { expected_revision: 2 },
    { character_id: reference },
    { other: true },
    { caption: 'x'.repeat(2001) },
    { expected_revision: -1 },
    { source_shot_id: 'shot' },
  ])
    await assert.rejects(f.run('attach_character_reference', { ...f.args, ...patch }));
  for (const role of ['viewer', 'commenter']) {
    f.role(role);
    await assert.rejects(f.run('attach_character_reference'), /Editing/);
  }
  assert.equal(f.objects.size, 0);
  f.role('editor');
  await f.run('attach_character_reference');
  await assert.rejects(
    f.run('attach_character_reference', { ...f.args, expected_revision: 1 }),
    /Replacement/,
  );
  await f.run('attach_character_reference', {
    ...f.args,
    expected_revision: 1,
    replace_existing: true,
    caption: 'Approved costume',
  });
  assert.equal(f.state().document.characters[0].visualReferences.length, 1);
});
test('source frames are copied without altering originals and foreign paths cannot be read', async () => {
  const f = fixture();
  const before = structuredClone(f.board);
  const shot = await f.run('get_shot_image', { storyboard_id: boardId, shot_id: 'shot' });
  assert.equal(shot.mcpImage.data, image.split(',')[1]);
  const args = { ...f.args, source_shot_id: 'shot' };
  delete args.image_data_url;
  await f.run('attach_character_reference', args);
  assert.deepEqual(f.board, before);
  f.state().document.characters[0].visualReferences[0].imagePath = 'foreign/path.png';
  await assert.rejects(
    f.run('get_character_reference_image', {
      project_id: project,
      character_id: character,
      reference_id: reference,
    }),
    /path/,
  );
  await assert.rejects(
    f.run('get_shot_image', { storyboard_id: boardId, shot_id: 'absent' }),
    /Shot not found/,
  );
  f.board.project_id = reference;
  await assert.rejects(
    f.run('get_character_reference_image', {
      project_id: project,
      character_id: character,
      reference_id: reference,
    }),
    /another project/,
  );
});
