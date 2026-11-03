import assert from 'node:assert/strict';

export async function checkProductionBrowser(page, fixture, board) {
  await page.locator('#tab-people').click();
  await page.waitForFunction(() =>
    document.getElementById('productionStatus').textContent.includes('Project records loaded'),
  );
  async function choose(kind) {
    await page.locator('#productionKind').selectOption(kind);
  }
  async function fill(values) {
    for (const [key, value] of Object.entries(values)) {
      const input = page.locator('#production-' + key);
      if (await input.evaluate((node) => node.tagName === 'SELECT'))
        await input.selectOption(value);
      else await input.fill(value);
    }
  }
  async function save() {
    const version = fixture.state.version + 1;
    await page.locator('#productionSave').click();
    await page.waitForFunction(
      (value) =>
        document
          .getElementById('productionStatus')
          .textContent.includes(`saved, register version ${value}.`),
      version,
    );
  }
  async function create(kind, values) {
    await choose(kind);
    await fill(values);
    await save();
  }
  await create('people', {
    name: 'Alex fixture',
    job: 'Camera',
    email: 'alex@example.test',
    phone: 'Fixture phone',
    availability: 'Mon-Wed',
    callNotes: 'Allow preparation time',
    notes: '<img src=x onerror="window.contactInjected=true">',
  });
  const person = fixture.state.document.people[0].id;
  assert.equal(await page.evaluate(() => window.contactInjected), undefined);
  await page.locator('#productionRecords button').first().click();
  await fill({ job: 'Director of photography' });
  await save();
  assert.equal(fixture.state.document.people[0].phone, 'Fixture phone');
  await create('characters', { name: 'Pilot fixture', performerId: person });
  const character = fixture.state.document.characters[0].id;
  await create('locations', {
    name: 'Fixture studio',
    address: 'Synthetic address',
    contact: 'Fixture venue contact',
    access: 'Permission checked',
    parking: 'Crew parking',
    travel: 'Allow setup',
    availability: 'Weekdays',
    permission: 'confirmed',
  });
  const venue = fixture.state.document.locations[0].id;
  await create('settings', { name: 'INT. CABIN', locationId: venue });
  const setting = fixture.state.document.settings[0].id;
  await create('scenes', { name: 'Scene fixture', settingId: setting });
  const scene = fixture.state.document.scenes[0].id;
  await create('shotLinks', {
    boardId: board.id,
    shotId: board.document.shots[0].id,
    sceneId: scene,
    characterIds: [character],
    crewIds: [person],
  });
  assert.equal(fixture.state.document.shotLinks[0].shotId, 'shot-1');
  await choose('people');
  await page.locator('#productionRecords button').first().click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#productionDelete').click();
  await page.waitForFunction(() =>
    document.getElementById('productionStatus').textContent.includes('Remove its assignments'),
  );
  assert.equal(fixture.state.document.people.length, 1);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#productionNew').click();
  await fill({ name: 'Temporary crew' });
  await save();
  await page.locator('#productionRecords button').last().click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#productionDelete').click();
  await page.waitForFunction(() =>
    document.getElementById('productionStatus').textContent.includes('record removed'),
  );
  assert.equal(fixture.state.document.people.length, 1);
  // A stale write must retain the form and stop retries until explicitly refreshed.
  await page.locator('#productionRecords button').first().click();
  await fill({ job: 'Unsaved local edit' });
  fixture.state.version++;
  await page.locator('#productionSave').click();
  await page.waitForFunction(() =>
    document.getElementById('productionStatus').textContent.includes('Production register changed'),
  );
  assert.equal(await page.locator('#production-job').inputValue(), 'Unsaved local edit');
  assert.equal(await page.locator('#productionSave').isDisabled(), true);
  assert.equal(fixture.state.document.people[0].job, 'Director of photography');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#productionReload').click();
  assert.equal(await page.locator('#production-job').inputValue(), 'Unsaved local edit');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#productionReload').click();
  await page.waitForFunction(() =>
    document.getElementById('productionStatus').textContent.includes('Project records loaded'),
  );
  await page.locator('#productionRecords button').first().click();
  await fill({ job: 'Confirmed after lost response' });
  fixture.failure = 'timeout';
  await page.locator('#productionSave').click();
  await page.waitForFunction(() =>
    document.getElementById('productionStatus').textContent.includes('confirmation timed out'),
  );
  assert.equal(await page.locator('#productionSave').isDisabled(), true);
  assert.equal(await page.locator('#production-job').inputValue(), 'Confirmed after lost response');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#productionReload').click();
  await page.waitForFunction(() =>
    document.getElementById('productionStatus').textContent.includes('Project records loaded'),
  );
  await page.locator('#productionRecords button').first().click();
  assert.equal(await page.locator('#production-job').inputValue(), 'Confirmed after lost response');
  // Reload/switch boards keeps project-wide records; website collaborators need no ChatGPT identity.
  await page.reload();
  await page.waitForFunction(() =>
    document.getElementById('accountLabel').textContent.includes('editor@example.test'),
  );
  await page.locator('#projectSelect').selectOption(fixture.state.project_id);
  await page.locator('#tab-people').click();
  await page.waitForFunction(() =>
    document.getElementById('productionStatus').textContent.includes('Project records loaded'),
  );
  assert.match(await page.locator('#productionRecords').textContent(), /Alex fixture/);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#productionSave').isVisible(), true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#tab-storyboard').click();
}
