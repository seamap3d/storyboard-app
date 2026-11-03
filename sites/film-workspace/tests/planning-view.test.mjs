import test from 'node:test';
import assert from 'node:assert/strict';
import { runTool } from '../server/storyboard-tools.mjs';

test('MCP requirements include shot mentions and retain manually recorded inventory details', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const board = {
    id,
    name: 'Synthetic film',
    version: 2,
    document: {
      shots: [
        { id: 'a', props: 'Cup; Chair', equipment: 'Camera' },
        { id: 'b', props: 'cup' },
      ],
      planning: {
        requirements: [
          {
            id: 'owned-cup',
            kind: 'prop',
            name: 'Cup',
            quantity: 3,
            readiness: 'ready',
            providedBy: 'Props department',
          },
        ],
      },
    },
  };
  const before = structuredClone(board);
  const result = await runTool(
    { list: async () => [board] },
    { id: 'reader' },
    'get_planning_gaps',
    { storyboard_id: id },
  );
  assert.equal(result.requirements.length, 3);
  const cup = result.requirements.find((item) => item.key === 'prop:cup');
  assert.equal(cup.id, 'owned-cup');
  assert.equal(cup.quantity, 3);
  assert.equal(cup.readiness, 'ready');
  assert.equal(cup.providedBy, 'Props department');
  assert.deepEqual(
    cup.shots.map((shot) => shot.id),
    ['a', 'b'],
  );
  const camera = result.requirements.find((item) => item.key === 'equipment:camera');
  assert.equal(camera.quantity, '');
  assert.equal(camera.readiness, 'needed');
  assert.deepEqual(board, before);
});
