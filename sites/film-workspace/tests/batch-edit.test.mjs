import test from 'node:test';
import assert from 'node:assert/strict';
import { runTool } from '../server/storyboard-tools.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const args = {
  storyboard_id: id,
  expected_revision: 5,
  updates: [
    { shot_id: 'first', changes: { location: 'Rural road', props: 'Pickup truck' } },
    { shot_id: 'second', changes: { cast: 'Casey; Alex', location: 'Pickup truck interior' } },
  ],
};
function fixture(role = 'owner', conflict = false) {
  const board = {
    id,
    project_id: 'project',
    name: 'Private film',
    version: 5,
    document: {
      meta: { custom: 'preserve' },
      planning: { requirements: [{ name: 'Case', quantity: 2 }] },
      customRoot: true,
      shots: [
        { id: 'first', desc: 'Keep description', imagePath: 'private-a' },
        {
          id: 'second',
          customTitle: 'Keep title',
          imagePath: 'private-b',
          imageCaption: 'Approved',
        },
        { id: 'other', notes: 'Leave unchanged' },
      ],
    },
  };
  const writes = [];
  const client = {
    list: async (table) =>
      table === 'storyboards'
        ? [board]
        : table === 'film_projects'
          ? [{ owner_id: role === 'owner' ? 'user' : 'other' }]
          : [{ role }],
    rpc: async (name, value) => {
      writes.push(value);
      assert.equal(name, 'save_storyboard');
      if (conflict) throw Object.assign(new Error('Changed elsewhere'), { code: '40001' });
      return { id, version: 6 };
    },
  };
  return { board, client, writes };
}

test('a planning batch saves once and preserves every unrequested field and image', async () => {
  const f = fixture();
  const original = structuredClone(f.board);
  const result = await runTool(f.client, { id: 'user' }, 'update_shots', args);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].p_version, 5);
  const expected = structuredClone(original.document);
  Object.assign(expected.shots[0], { location: 'Rural road', props: 'Pickup truck' });
  Object.assign(expected.shots[1], {
    chars: 'Casey; Alex',
    location: 'Pickup truck interior',
  });
  assert.deepEqual(f.writes[0].p_document, expected);
  assert.deepEqual(f.board, original);
  assert.equal(result.revision, 6);
  assert.equal(result.updated_shots.length, 2);
});

test('a missing or ambiguous shot prevents the whole batch from saving', async () => {
  for (const ambiguous of [false, true]) {
    const f = fixture();
    const before = structuredClone(f.board);
    const updates = ambiguous
      ? args.updates
      : [...args.updates, { shot_id: 'missing', changes: { props: 'Case' } }];
    if (ambiguous) f.board.document.shots.push(structuredClone(f.board.document.shots[1]));
    const source = structuredClone(f.board);
    await assert.rejects(
      runTool(f.client, { id: 'user' }, 'update_shots', { ...args, updates }),
      /not found or ambiguous/,
    );
    assert.equal(f.writes.length, 0);
    assert.deepEqual(f.board, source);
    assert.equal(before.document.shots[0].location, undefined);
  }
});

test('duplicate IDs, invalid fields and invalid later entries fail before any reads', async () => {
  let reads = 0;
  const client = {
    list: async () => {
      reads++;
      throw Error('Unexpected read');
    },
  };
  for (const updates of [
    [],
    [args.updates[0], args.updates[0]],
    [args.updates[0], { shot_id: 'second', changes: { imagePath: 'replace' } }],
    [args.updates[0], { shot_id: 'second', changes: {}, ignored: true }],
    Array.from({ length: 101 }, (_, index) => ({
      shot_id: 's-' + index,
      changes: { props: 'Case' },
    })),
  ]) {
    await assert.rejects(runTool(client, { id: 'user' }, 'update_shots', { ...args, updates }));
  }
  assert.equal(reads, 0);
});

test('batch role and revision guards match single edits and racing saves are never replayed', async () => {
  for (const role of ['viewer', 'commenter']) {
    const f = fixture(role);
    await assert.rejects(runTool(f.client, { id: 'user' }, 'update_shots', args), /Editing access/);
    assert.equal(f.writes.length, 0);
  }
  const stale = fixture();
  await assert.rejects(
    runTool(stale.client, { id: 'user' }, 'update_shots', { ...args, expected_revision: 4 }),
    /Storyboard changed/,
  );
  assert.equal(stale.writes.length, 0);
  const editor = fixture('editor');
  await runTool(editor.client, { id: 'user' }, 'update_shots', args);
  assert.equal(editor.writes.length, 1);
  const race = fixture('owner', true);
  const before = structuredClone(race.board);
  await assert.rejects(
    runTool(race.client, { id: 'user' }, 'update_shots', args),
    (error) => error.code === '40001',
  );
  assert.equal(race.writes.length, 1);
  assert.deepEqual(race.board, before);
});

test('an unchanged batch does not save or increment the revision', async () => {
  const f = fixture();
  const result = await runTool(f.client, { id: 'user' }, 'update_shots', {
    ...args,
    updates: [
      { shot_id: 'first', changes: { description: 'Keep description' } },
      { shot_id: 'second', changes: { title: 'Keep title' } },
    ],
  });
  assert.equal(result.changed, false);
  assert.equal(result.revision, 5);
  assert.equal(f.writes.length, 0);
  assert.deepEqual(result.unchanged_shots, ['first', 'second']);
});
