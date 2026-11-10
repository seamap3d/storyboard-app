import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
export async function checkResourcesBrowser(page, fixture, board) {
  board.document.shots[0].props = 'Radio; Chair';
  board.document.shots[0].equipment = 'Recorder';
  board.document.shots[0].shootDate = '2026-11-10';
  board.document.planning = {
    requirements: [
      {
        kind: 'prop',
        name: 'Radio',
        quantity: 2,
        providedBy: 'Earlier supplier',
        readiness: 'ready',
        notes: 'Preserve source logistics',
      },
    ],
  };
  const extra = {
    id: '77777777-7777-4777-8777-777777777777',
    project_id: board.project_id,
    name: 'Alternate storyboard',
    version: 1,
    document: {
      meta: {},
      shots: [
        {
          id: 'other-shot',
          scene: 'Road',
          desc: 'Other framing',
          props: 'radio',
          shootDate: '2026-11-11',
        },
      ],
    },
  };
  fixture.extraBoards.push(extra);
  await page.locator('#reloadShared').click();
  await page.locator('#tab-requirements').click();
  await page.waitForFunction(() =>
    document.getElementById('resourcesStatus').textContent.includes('Project records loaded'),
  );
  const review = page.locator('.resource-review');
  await review.locator('summary').first().click();
  const radio = page.locator('.resource-suggestion[data-requirement-key="prop:radio"]');
  await radio.locator('button').click();
  await page.waitForFunction(() =>
    document.getElementById('resourcesStatus').textContent.includes('Reviewed requirement saved'),
  );
  assert.equal(fixture.state.document.resources.length, 1);
  assert.equal(fixture.state.document.resourceLinks.length, 2);
  assert.equal(fixture.state.document.resources[0].availableQuantity, '');
  assert.equal(fixture.state.document.resources[0].readiness, 'needed');
  await page.locator('#resourcesRecords button').filter({ hasText: 'Radio' }).first().click();
  assert.match(
    await page.locator('#resourceLegacyNotes').textContent(),
    /Preserve source logistics/,
  );
  await page.locator('#resources-availableQuantity').fill('2');
  await page.locator('#resources-providedBy').fill('Actual supplier');
  await page.locator('#resources-readiness').selectOption('ready');
  await page
    .locator('#resources-responsiblePersonId')
    .selectOption(fixture.state.document.people[0].id);
  await page.locator('#resources-unit').fill('radios');
  await page.locator('#resources-availability').fill('Producer-confirmed fixture');
  await page.locator('#resources-collectionNotes').fill('Collect at base');
  await page.locator('#resources-returnNotes').fill('Return after wrap');
  async function save() {
    const target = fixture.state.version + 1;
    await page.locator('#resourcesSave').click();
    await page.waitForFunction(
      (version) =>
        document
          .getElementById('resourcesStatus')
          .textContent.includes(`saved, register version ${version}.`),
      target,
    );
  }
  await save();
  assert.equal(fixture.state.document.resources[0].availableQuantity, 2);
  await page.locator('#resourcesKind').selectOption('resourceLinks');
  await page.locator('#resourcesRecords button').first().click();
  await page.locator('#resources-requiredQuantity').fill('2');
  await page.locator('#resources-allocatedQuantity').fill('1');
  await page.locator('#resources-notes').fill('Check batteries');
  await save();
  await page.locator('#resourcesKind').selectOption('resources');
  await page
    .locator('.resource-suggestion[data-requirement-key="prop:chair"] .review-resource')
    .check();
  await page
    .locator('.resource-suggestion[data-requirement-key="equipment:recorder"] .review-resource')
    .check();
  await page.locator('#promoteSelectedResources').click();
  await page.waitForFunction(() =>
    document.getElementById('projectResourcesTable').textContent.includes('Recorder'),
  );
  assert.equal(fixture.state.document.resources.length, 3);
  await page.locator('#resourceSearch').fill('Radio');
  const csvPromise = page.waitForEvent('download');
  await page.locator('#exportProjectResources').click();
  const csv = await readFile(await (await csvPromise).path(), 'utf8');
  assert.match(csv, /Radio/);
  assert.match(csv, /Actual supplier/);
  assert.doesNotMatch(csv, /"Chair"/);
  await page.locator('#resourceSearch').fill('');
  await page.locator('#resourceCategory').selectOption('equipment');
  assert.equal(await page.locator('#projectResourcesTable tbody tr').count(), 1);
  await page.locator('#resourceCategory').selectOption('');
  await page.locator('#tab-shot-list').click();
  await page.locator('#shotListScope').selectOption('project');
  await page.waitForFunction(() => document.querySelectorAll('#shotTable tbody tr').length === 2);
  assert.match(await page.locator('#shotTable').textContent(), /Radio/);
  assert.match(await page.locator('#shotTable').textContent(), /Other framing/);
  await page.locator('#shotDay').selectOption('2026-11-11');
  assert.equal(await page.locator('#shotTable tbody tr').count(), 1);
  const shotCsvPromise = page.waitForEvent('download');
  await page.locator('#exportShotCsv').click();
  const shotCsv = await readFile(await (await shotCsvPromise).path(), 'utf8');
  assert.match(shotCsv, /Alternate storyboard/);
  assert.doesNotMatch(shotCsv, /Test storyboard/);
  await page.locator('#shotTable tbody tr button').first().click();
  await page.waitForFunction(
    () => document.getElementById('boardSelect').value === '77777777-7777-4777-8777-777777777777',
  );
  assert.equal(await page.locator('.desc').inputValue(), 'Other framing');
  await page.locator('#boardSelect').selectOption(board.id);
  await page.waitForFunction(() => document.querySelector('.desc')?.value === 'Opening frame');
  await page.locator('#tab-shot-list').click();
  await page.locator('#shotListScope').selectOption('board');
  await page.locator('#shotDay').selectOption('');
  await page.locator('#shotTable tbody tr button').first().click();
  assert.equal(await page.locator('#storyboardEditor').isVisible(), true);
  await page.locator('#tab-requirements').click();
  await page.locator('#resourcesRecords button').filter({ hasText: 'Radio' }).first().click();
  await page.locator('#resources-availableQuantity').fill('3');
  fixture.state.version++;
  await page.locator('#resourcesSave').click();
  await page.waitForFunction(() =>
    document.getElementById('resourcesStatus').textContent.includes('Production register changed'),
  );
  assert.equal(await page.locator('#resources-availableQuantity').inputValue(), '3');
  assert.equal(await page.locator('#resourcesSave').isDisabled(), true);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#resourcesReload').click();
  await page.waitForFunction(() =>
    document.getElementById('resourcesStatus').textContent.includes('Project records loaded'),
  );
  assert.equal(fixture.state.document.resources[0].availableQuantity, 2);
  // Removing source mentions leaves the reviewed register and manual logistics intact.
  extra.document.shots[0].props = '';
  await page.locator('#resourcesReload').click();
  await page.waitForFunction(() =>
    document.getElementById('resourcesStatus').textContent.includes('Project records loaded'),
  );
  assert.equal(fixture.state.document.resources[0].providedBy, 'Actual supplier');
  assert.equal(
    fixture.state.document.resourceLinks.filter(
      (link) => link.resourceId === fixture.state.document.resources[0].id,
    ).length,
    2,
  );
  await page.reload();
  await page.waitForFunction(() =>
    document.getElementById('accountLabel').textContent.includes('editor@example.test'),
  );
  await page.locator('#projectSelect').selectOption(board.project_id);
  await page.locator('#tab-requirements').click();
  await page.waitForFunction(() =>
    document.getElementById('projectResourcesTable').textContent.includes('Actual supplier'),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#resourcesSave').isVisible(), true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#tab-storyboard').click();
}
