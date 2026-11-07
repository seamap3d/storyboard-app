import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyProduction,
  patchProduction,
  validateProduction,
  normalizeProduction,
} from '../app/production-model.mjs';
import {
  resourceSuggestions,
  promoteResources,
  projectResources,
  resourceReadiness,
  projectShotRows,
  linkedResourceNames,
} from '../app/resource-model.mjs';
import { runTool } from '../server/storyboard-tools.mjs';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture() {
  return {
    project_id: id(1),
    version: 2,
    document: { ...emptyProduction(), futureRoot: { keep: true } },
    storyboards: [
      {
        id: id(2),
        name: 'First board',
        requirements: [
          {
            kind: 'prop',
            name: 'Radio',
            quantity: 2,
            providedBy: 'Earlier supplier',
            readiness: 'ready',
            notes: 'Preserve legacy notes',
          },
        ],
        shots: [
          {
            id: 'one',
            scene: 'Cabin',
            props: 'Radio; Radio; Chair',
            equipment: 'Recorder',
            shootDate: '2026-11-10',
            estimatedMinutes: 10,
          },
        ],
      },
      {
        id: id(3),
        name: 'Alternate cut',
        shots: [
          {
            id: 'two',
            scene: 'Road',
            props: ' radio ',
            shootDate: '2026-11-11',
            estimatedMinutes: 20,
          },
        ],
      },
    ],
  };
}
const selection = [{ category: 'prop', name: 'Radio' }];
function promoted() {
  const state = fixture();
  let serial = 10;
  state.document = promoteResources(state, selection, () => id(serial++));
  return state;
}
test('reviewed source promotion consolidates cross-board mentions without inventing logistics', () => {
  const state = fixture(),
    original = structuredClone(state),
    suggestions = resourceSuggestions(state);
  assert.equal(suggestions.length, 3);
  const radio = suggestions.find((item) => item.name === 'Radio');
  assert.equal(radio.uses.length, 2);
  let serial = 10;
  const document = promoteResources(state, selection, () => id(serial++));
  assert.deepEqual(state, original);
  assert.equal(document.resources.length, 1);
  assert.equal(document.resourceLinks.length, 2);
  assert.equal(document.resources[0].availableQuantity, '');
  assert.equal(document.resources[0].readiness, 'needed');
  assert.equal(document.resources[0].sourceDetails[0].notes, 'Preserve legacy notes');
  assert.deepEqual(document.futureRoot, { keep: true });
  const again = promoteResources({ ...state, document }, selection);
  assert.deepEqual(again, document);
});
test('resource records preserve manual values, permit explicit aliases and reject ambiguous edits', () => {
  const state = promoted();
  const resource = state.document.resources[0];
  state.document = patchProduction(state.document, 'resources', resource.id, {
    availableQuantity: 0,
    providedBy: 'Actual supplier',
    readiness: 'sourcing',
    collectionNotes: 'Collect morning',
    returnNotes: 'Return evening',
  });
  const next = promoteResources(state, selection);
  assert.equal(next.resources[0].availableQuantity, 0);
  assert.equal(next.resources[0].providedBy, 'Actual supplier');
  assert.equal(next.resources[0].collectionNotes, 'Collect morning');
  assert.throws(
    () => patchProduction(next, 'resources', id(99), { name: ' radio ', category: 'prop' }),
    /already exists/,
  );
  assert.throws(() => patchProduction(next, 'resources', resource.id, {}, true), /link is missing/);
  const alias = promoteResources({ ...state, document: next }, [
    { category: 'prop', name: 'Chair', resource_id: resource.id },
  ]);
  assert.equal(alias.resources.length, 1);
  assert.equal(alias.resourceLinks.length, 2);
  assert.throws(
    () =>
      promoteResources(state, [
        { category: 'equipment', name: 'Recorder', resource_id: resource.id },
      ]),
    /cannot combine/,
  );
  assert.throws(
    () => promoteResources(state, [{ category: 'prop', name: 'Radio', resource_id: id(88) }]),
    /not found/,
  );
  assert.throws(
    () => promoteResources(state, [{ category: 'prop', name: 'Radio', resource_id: 'bad' }]),
    /valid target/,
  );
  assert.throws(() => promoteResources(state, []));
  assert.throws(() => promoteResources(state, [...selection, ...selection]));
  assert.throws(() => promoteResources(state, [{ category: 'prop', name: 'Missing' }]));
  assert.throws(() => promoteResources(state, [{ category: 'wrong', name: 'Radio' }]));
});
test('quantities distinguish zero and unknown, reject invalid values and preserve old document compatibility', () => {
  const state = promoted(),
    resource = state.document.resources[0],
    link = state.document.resourceLinks[0];
  for (const value of [-1, Infinity, NaN, 1000001, '3', null, {}])
    assert.throws(() =>
      patchProduction(state.document, 'resources', resource.id, { availableQuantity: value }),
    );
  for (const value of ['', 0, 1.5, 1000000])
    assert.equal(
      patchProduction(state.document, 'resources', resource.id, { availableQuantity: value })
        .resources[0].availableQuantity,
      value,
    );
  assert.throws(() =>
    patchProduction(state.document, 'resources', resource.id, { category: 'unknown' }),
  );
  assert.throws(() =>
    patchProduction(state.document, 'resources', resource.id, { readiness: 'booked' }),
  );
  assert.throws(() =>
    patchProduction(state.document, 'resources', resource.id, { responsiblePersonId: id(55) }),
  );
  assert.throws(() =>
    patchProduction(state.document, 'resourceLinks', id(55), { ...link, id: undefined }),
  );
  assert.throws(() =>
    patchProduction(state.document, 'resourceLinks', id(55), {
      resourceId: resource.id,
      boardId: link.boardId,
      shotId: link.shotId,
    }),
  );
  const legacy = emptyProduction();
  delete legacy.resources;
  delete legacy.resourceLinks;
  assert.equal(validateProduction(legacy), legacy);
  assert.deepEqual(normalizeProduction(legacy).resources, []);
  assert.throws(() => validateProduction({ ...legacy, resources: null }));
});
test('project resource usage survives removed mentions, flags shortages and preserves board-local shot numbers', () => {
  const state = promoted(),
    resource = state.document.resources[0];
  state.document = patchProduction(state.document, 'resources', resource.id, {
    availableQuantity: 1,
  });
  state.document = patchProduction(
    state.document,
    'resourceLinks',
    state.document.resourceLinks[0].id,
    { requiredQuantity: 2, allocatedQuantity: 1 },
  );
  const rows = projectResources(state);
  assert.equal(rows[0].uses.length, 2);
  assert.ok(resourceReadiness(rows[0]).includes('Shot requirement exceeds recorded availability'));
  assert.deepEqual(linkedResourceNames(state, id(2), 'one'), ['Radio']);
  assert.deepEqual(
    projectShotRows(state).map((shot) => shot.displayNumber),
    [1, 1],
  );
  assert.equal(projectShotRows(state, { day: '2026-11-11' })[0].boardName, 'Alternate cut');
  assert.equal(projectResources(state, { category: 'equipment' }).length, 0);
  assert.equal(projectResources(state, { search: 'missing' }).length, 0);
  state.storyboards[0].shots[0].props = '';
  assert.equal(projectResources(state)[0].uses.length, 2);
  state.storyboards[0].shots = [];
  assert.ok(resourceReadiness(projectResources(state)[0]).includes('Linked shot unavailable'));
  state.document.resourceLinks = [];
  assert.equal(projectResources(state).length, 1);
});
test('resource MCP reads and promotions use the same atomic revision guard and do not replay writes', async () => {
  let state = fixture(),
    writes = 0;
  const client = {
    rpc: async (name, body) => {
      if (name === 'get_project_production') return structuredClone(state);
      writes++;
      state = { ...state, document: body.p_document, version: state.version + 1 };
      return state;
    },
  };
  const read = await runTool(client, {}, 'get_project_resources', { project_id: state.project_id });
  assert.equal(read.resources.length, 0);
  assert.equal(read.suggestions.length, 3);
  const args = { project_id: state.project_id, expected_revision: 2, requirements: selection };
  const saved = await runTool(client, {}, 'promote_resource_mentions', args);
  assert.equal(saved.version, 3);
  assert.equal(writes, 1);
  await assert.rejects(runTool(client, {}, 'promote_resource_mentions', args), /changed/);
  assert.equal(writes, 1);
  await assert.rejects(
    runTool(client, {}, 'get_project_resources', { project_id: 'bad' }),
    /valid project/,
  );
  await assert.rejects(runTool(client, {}, 'get_project_resources', null), /Arguments/);
  await assert.rejects(
    runTool(client, {}, 'get_project_resources', { project_id: id(1), extra: true }),
    /Unknown/,
  );
  await assert.rejects(
    runTool(client, {}, 'promote_resource_mentions', { ...args, expected_revision: -1 }),
    /revision/,
  );
  const denied = {
    rpc: async (name) => {
      if (name === 'get_project_production') return structuredClone(state);
      throw Object.assign(new Error('Editing access required.'), { status: 403, code: '42501' });
    },
  };
  await assert.rejects(
    runTool(denied, {}, 'promote_resource_mentions', { ...args, expected_revision: 3 }),
    { code: '42501' },
  );
});
