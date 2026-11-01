import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export async function checkPlanningBrowser(page, png) {
  const original = {
    meta: { title: 'Imported fixture', customMetadata: 'preserve' },
    customRoot: { preserved: true },
    shots: [
      {
        id: 'import-a',
        scene: 'INT. ROOM - DAY',
        customTitle: 'Opening',
        desc: 'Original action',
        location: 'Room',
        props: 'Cup, Chair',
        equipment: 'Camera',
        customField: 'keep',
        type: 'Custom framing',
        imageData: 'data:image/png;base64,' + png.toString('base64'),
      },
      { id: 'import-b', scene: 'EXT. BEACH - DAY', desc: 'Second shot', location: 'Beach' },
    ],
  };
  const dialogs = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });
  await page.locator('#fileInput').setInputFiles({
    name: 'fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(original)),
  });
  await page.waitForFunction(() => document.querySelectorAll('#shotList > li').length === 2);
  assert.equal(await page.locator('.type').first().inputValue(), 'Custom framing');
  const invalidDialog = page.waitForEvent('dialog');
  await page.locator('#fileInput').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{invalid'),
  });
  await page.waitForFunction(() =>
    document.getElementById('sharedStatus').textContent.includes('2 shots imported'),
  );
  await invalidDialog;
  assert.equal(await page.locator('#shotList > li').count(), 2);
  assert.ok(dialogs.some((message) => message.includes('Invalid JSON')));

  await page.locator('#selectAllShots').check();
  await page.locator('#btnFoldSelected').click();
  assert.equal(await page.locator('#shotList > li[data-folded=true]').count(), 2);
  await page.locator('#selectAllShots').check();
  await page.locator('#btnUnfoldSelected').click();
  assert.equal(await page.locator('#shotList > li[data-folded=true]').count(), 0);
  await page.locator('.btnDup').first().click();
  assert.equal(await page.locator('#shotList > li').count(), 3);
  await page.locator('.btnDelete').nth(1).click();
  assert.equal(await page.locator('#shotList > li').count(), 2);
  await page.locator('.remove-image').first().click();
  await page
    .locator('.image-upload')
    .first()
    .setInputFiles({ name: 'restored.png', mimeType: 'image/png', buffer: png });
  await page.locator('.frame-image').first().waitFor({ state: 'visible' });

  await page.locator('[data-tab="shot-list"]').click();
  const firstRow = page.locator('#shotTable tr[data-shot-id="import-a"]');
  await firstRow.locator('[data-field="desc"]').fill('Planning edit');
  await firstRow.locator('[data-field="desc"]').dispatchEvent('change');
  await firstRow.locator('[data-field="estimatedMinutes"]').fill('15');
  await firstRow.locator('[data-field="estimatedMinutes"]').dispatchEvent('change');
  await page.locator('#shotSort').selectOption('scene');
  await page.locator('#shotSearch').fill('Planning edit');
  assert.equal(await page.locator('#shotTable tbody tr').count(), 1);
  const shotDownload = page.waitForEvent('download');
  await page.locator('#exportShotCsv').click();
  const shotCsv = await readFile(await (await shotDownload).path(), 'utf8');
  assert.ok(shotCsv.includes('Planning edit'));
  assert.ok(!shotCsv.includes('Second shot'));
  await page.locator('#shotSearch').fill('');
  await page.locator('#shotLocation').selectOption('Beach');
  assert.equal(await page.locator('#shotTable tbody tr').count(), 1);
  await page.locator('#shotLocation').selectOption('');

  await page.locator('[data-tab="requirements"]').click();
  await page.locator('#requirementSearch').fill('Cup');
  const cup = page.locator('#requirementsTable tr[data-requirement-key="prop:cup"]');
  await cup.locator('[data-field="quantity"]').fill('3');
  await cup.locator('[data-field="quantity"]').dispatchEvent('change');
  await cup.locator('[data-field="readiness"]').selectOption('ready');
  await page.locator('#requirementSearch').fill('');
  await page.locator('#newRequirementName').fill('Tripod');
  await page.locator('#newRequirementKind').selectOption('equipment');
  await page.locator('#addRequirement button').click();
  await page.locator('#requirementKind').selectOption('equipment');
  assert.equal(await page.locator('#requirementsTable tbody tr').count(), 2);
  await page.locator('#requirementKind').selectOption('');
  const requirementDownload = page.waitForEvent('download');
  await page.locator('#exportRequirementCsv').click();
  const requirementCsv = await readFile(await (await requirementDownload).path(), 'utf8');
  assert.ok(requirementCsv.includes('Tripod'));
  assert.ok(requirementCsv.includes('"3"'));

  await page.locator('[data-tab="storyboard"]').click();
  assert.equal(await page.locator('.desc').first().inputValue(), 'Planning edit');
  const jsonDownload = page.waitForEvent('download');
  await page.locator('#btnExport').click();
  const exported = JSON.parse(await readFile(await (await jsonDownload).path(), 'utf8'));
  assert.deepEqual(exported.customRoot, original.customRoot);
  assert.equal(exported.meta.customMetadata, 'preserve');
  assert.equal(exported.shots[0].customField, 'keep');
  assert.equal(exported.shots[0].imageData, original.shots[0].imageData);
  assert.equal(exported.planning.requirements.find((item) => item.name === 'Cup').quantity, 3);
  await page.locator('#cloudSave').click();
  await page.waitForFunction(() =>
    document.getElementById('sharedStatus').textContent.includes('Saved to shared storage'),
  );
}
