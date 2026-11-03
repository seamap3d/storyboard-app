import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyProduction,
  validateProduction,
  patchProduction,
  productionGaps,
} from '../app/production-model.mjs';
import { readProduction, writeProduction } from '../app/production-client.mjs';
import { runTool, toolDefinitions } from '../server/storyboard-tools.mjs';
const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
function document() {
  const value = emptyProduction();
  value.people = [
    { id: id(1), name: 'Performer', phone: 'Fixture contact', future: { retain: true } },
  ];
  value.characters = [{ id: id(2), name: 'Pilot', performerId: id(1) }];
  value.locations = [{ id: id(3), name: 'Studio', permission: 'unconfirmed' }];
  value.settings = [{ id: id(4), name: 'INT. CABIN', locationId: id(3) }];
  value.scenes = [{ id: id(5), name: 'Scene 1', settingId: id(4) }];
  value.shotLinks = [
    {
      id: id(6),
      boardId: id(7),
      shotId: 'stable-shot',
      sceneId: id(5),
      characterIds: [id(2)],
      crewIds: [id(1)],
    },
  ];
  value.futureRoot = { keep: true };
  return value;
}
function fixture({ denied = false, failure = null, array = false } = {}) {
  let state = { project_id: id(9), version: 2, document: document(), storyboards: [] };
  const writes = [];
  const client = {
    rpc: async (name, body) => {
      if (name === 'get_project_production') return structuredClone(state);
      writes.push(body);
      if (failure) throw failure;
      if (denied)
        throw Object.assign(new Error('Editing access required.'), { status: 403, code: '42501' });
      state = { ...state, document: body.p_document, version: state.version + 1 };
      return array ? [state] : state;
    },
  };
  return { client, writes, state: () => state };
}
test('production records link people, characters, settings, venues and stable shots independently', () => {
  const original = document();
  assert.equal(validateProduction(original), original);
  const patched = patchProduction(original, 'people', id(1), { job: 'Camera operator' });
  assert.equal(original.people[0].job, undefined);
  assert.equal(patched.people[0].phone, 'Fixture contact');
  assert.deepEqual(patched.people[0].future, { retain: true });
  assert.deepEqual(patched.futureRoot, { keep: true });
  assert.deepEqual(patched.shotLinks, original.shotLinks);
  const created = patchProduction(patched, 'people', id(10), { name: 'Crew' });
  assert.equal(created.people.length, 2);
  assert.equal(patchProduction(created, 'people', id(10), {}, true).people.length, 1);
  assert.throws(() => patchProduction(original, 'people', id(1), {}, true), /link is missing/);
  assert.throws(() => patchProduction(original, 'people', id(11), {}, true), /not found/);
});
test('production validation rejects invalid fields, dangling links and ambiguous shot assignments', () => {
  const invalid = [
    (doc) => {
      doc.people = null;
    },
    (doc) => {
      doc.people[0].id = 'bad';
    },
    (doc) => {
      doc.people[0].name = ' ';
    },
    (doc) => {
      doc.people[0].notes = 23;
    },
    (doc) => {
      doc.people[0].notes = 'x'.repeat(4001);
    },
    (doc) => {
      doc.people[0].name = 'x'.repeat(161);
    },
    (doc) => {
      doc.people.push({ ...doc.people[0] });
    },
    (doc) => {
      doc.characters[0].performerId = id(55);
    },
    (doc) => {
      doc.characters[0].performerId = 'bad';
    },
    (doc) => {
      doc.locations[0].permission = 'assumed';
    },
    (doc) => {
      doc.shotLinks[0].characterIds = ['bad'];
    },
    (doc) => {
      doc.shotLinks[0].crewIds = [id(1), id(1)];
    },
    (doc) => {
      doc.shotLinks[0].characterIds = [id(55)];
    },
    (doc) => {
      delete doc.shotLinks[0].boardId;
    },
    (doc) => {
      doc.shotLinks[0].shotId = '';
    },
    (doc) => {
      doc.shotLinks.push({ ...doc.shotLinks[0], id: id(55) });
    },
  ];
  for (const mutate of invalid) {
    const doc = document();
    mutate(doc);
    assert.throws(() => validateProduction(doc));
  }
  assert.throws(() => validateProduction(null));
  assert.throws(() => validateProduction({ ...document(), futureRoot: 'x'.repeat(1048576) }));
  assert.throws(() => patchProduction(document(), 'missing', id(1), {}));
  assert.throws(() => patchProduction(document(), 'people', id(1), { inventedField: true }));
  const gap = productionGaps(emptyProduction());
  assert.deepEqual(gap, {
    unassignedCharacters: [],
    unmappedSettings: [],
    incompleteVenues: [],
    peopleWithoutContact: [],
  });
  const doc = document();
  delete doc.characters[0].performerId;
  delete doc.settings[0].locationId;
  delete doc.people[0].phone;
  assert.deepEqual(productionGaps(doc), {
    unassignedCharacters: [id(2)],
    unmappedSettings: [id(4)],
    incompleteVenues: [id(3)],
    peopleWithoutContact: [id(1)],
  });
});
test('production client handles scalar/array RPC records and never replays uncertain writes', async () => {
  for (const array of [false, true]) {
    const f = fixture({ array });
    const state = await readProduction(f.client, id(9));
    const next = await writeProduction(f.client, state, 'people', id(1), {
      email: 'fixture@example.test',
    });
    assert.equal(next.version, 3);
    assert.equal(next.document.people[0].email, 'fixture@example.test');
    assert.equal(f.writes[0].p_version, 2);
  }
  const f = fixture({ failure: new TypeError('Connection lost after commit') });
  await assert.rejects(writeProduction(f.client, f.state(), 'people', id(1), { name: 'Changed' }), {
    code: 'RPC_UNCONFIRMED',
  });
  assert.equal(f.writes.length, 1);
  const bad = { rpc: async () => null };
  await assert.rejects(
    writeProduction(bad, fixture().state(), 'people', id(1), { name: 'Changed' }),
    { code: 'RPC_UNCONFIRMED' },
  );
});
test('provider tools validate targets, preserve omissions and reject stale or denied writes', async () => {
  const f = fixture();
  const base = {
    project_id: id(9),
    expected_revision: 2,
    collection: 'people',
    record_id: id(1),
    changes: { job: 'Director' },
  };
  const read = await runTool(f.client, {}, 'get_project_production', { project_id: id(9) });
  assert.equal(read.version, 2);
  const result = await runTool(f.client, {}, 'update_production_record', base);
  assert.equal(result.document.people[0].job, 'Director');
  assert.equal(result.document.people[0].phone, 'Fixture contact');
  await assert.rejects(runTool(f.client, {}, 'update_production_record', base), /changed/);
  assert.equal(f.writes.length, 1);
  await assert.rejects(runTool(f.client, {}, 'get_project_production', null), /Arguments/);
  await assert.rejects(
    runTool(f.client, {}, 'get_project_production', { project_id: 'bad' }),
    /valid project/,
  );
  await assert.rejects(
    runTool(f.client, {}, 'get_project_production', { project_id: id(9), extra: true }),
    /Unknown/,
  );
  await assert.rejects(
    runTool(f.client, {}, 'update_production_record', { ...base, expected_revision: -1 }),
    /revision/,
  );
  await assert.rejects(
    runTool(f.client, {}, 'update_production_record', { ...base, collection: 'unknown' }),
    /collection/,
  );
  const denied = fixture({ denied: true });
  await assert.rejects(runTool(denied.client, {}, 'update_production_record', base), {
    code: '42501',
  });
  assert.equal(denied.state().document.people[0].job, undefined);
  const standalone = fixture();
  await runTool(standalone.client, {}, 'update_production_record', {
    ...base,
    record_id: id(88),
    changes: { name: 'Crew member' },
  });
  const { changes: _changes, ...deletion } = base;
  await runTool(standalone.client, {}, 'delete_production_record', {
    ...deletion,
    expected_revision: 3,
    record_id: id(88),
  });
  assert.equal(standalone.state().document.people.length, 1);
  assert.deepEqual(
    toolDefinitions.filter((tool) => tool.name.includes('production')).map((tool) => tool.name),
    ['get_project_production', 'update_production_record', 'delete_production_record'],
  );
});
