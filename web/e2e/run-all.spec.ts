// "Run all three steps" (contract v1.43 judges.runAll, v1.44 review.both.*, v1.47 routing.json bothWays): one
// press from the judges' page to the results with what the paystub changed. Both halves of the hybrid are
// read, one after the other: the device's (read now on this device with a model, otherwise the recorded
// on-device reading), then the same silhouette read now in the cloud (ONLY_IN_CLOUD, the request of a
// normal Send, listed in the record). When the live cloud reading does not complete, the recorded cloud
// reading is shown instead and the review says why. The review shows the two answers side by side.
import { expect, test, type Page } from '@playwright/test';
import { AI_HOST, cloudRefusesAppCheck, fakeCloudModel, fakeFirebaseBackends, fakeOnDeviceModel, fixturePointers, noOnDeviceModel } from './model-fakes';

/** Every route the reading staging shows, in order. */
async function watchRoutes(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __routes: string[] }).__routes = seen;
    new MutationObserver(() => {
      const route = document.querySelector('[data-testid="reading-show"]')?.getAttribute('data-route');
      if (route && seen[seen.length - 1] !== route) seen.push(route);
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-route'] });
  });
  return () => page.evaluate(() => (window as unknown as { __routes: string[] }).__routes);
}

async function runAll(page: Page) {
  await page.goto('/#/judges');
  const card = page.getByTestId('judges-run-all');
  // The button's words say what leaves before it is pressed.
  await expect(card).toContainText('Only the silhouette is sent');
  await card.getByRole('button', { name: 'Run all three steps' }).click();
}

/** A device model that reads the sample (core, then deductions) and passes its checks. */
async function deviceReadsSample(page: Page) {
  const { deductions, ...core } = fixturePointers('paystub-en-01-correct');
  await fakeOnDeviceModel(page.context(), {
    availability: 'available',
    systemReplies: { 'answer only the fields in the schema': JSON.stringify(core), 'answer only the deductions': JSON.stringify({ deductions }) },
    replies: {},
  });
}

test('nothing is sent while the person only looks at the judges\' page', async ({ page, context }) => {
  await noOnDeviceModel(context);
  const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
  const ai: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).hostname === AI_HOST) ai.push(r.url());
  });
  await page.goto('/#/judges');
  await expect(page.getByTestId('judges-run-all')).toBeVisible();
  await page.waitForTimeout(2500);
  expect(ai).toEqual([]);
  expect(cloud.bodies).toEqual([]);
});

test('no model here, cloud answers: the recorded device reading, then the silhouette read now in the cloud, compared, and the request in the record', async ({ page, context }) => {
  await noOnDeviceModel(context);
  const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
  const routes = await watchRoutes(page);
  await runAll(page);
  // The device's half first, naming the machine it was recorded on; then the silhouette going to the cloud now.
  await expect(page.getByTestId('reading-show')).toHaveAttribute('data-route', 'recorded-device');
  await expect(page.getByTestId('reading-show-stage')).toContainText(/Chrome \d+/);
  await expect(page.getByTestId('reading-show')).toHaveAttribute('data-route', 'compare-cloud', { timeout: 10_000 });
  await expect(page.getByTestId('reading-show-badge')).toHaveText('Cloud');
  await expect(page.getByTestId('reading-show-reason')).toHaveText('read in the cloud too, to compare');

  const both = page.getByTestId('both-ways');
  await expect(both).toBeVisible({ timeout: 10_000 });
  await expect(both).toHaveAttribute('data-cloud-live', 'true');
  await expect(page.getByTestId('both-device')).toContainText(/recorded on Chrome \d+ · Mac, /);
  await expect(page.getByTestId('both-cloud')).toContainText(/gemini-[\w.-]+, read now/);
  await expect(page.getByTestId('both-cloud-reason')).toHaveText('read in the cloud too, to compare');
  await expect(page.getByTestId('both-row-grossPay').locator('[data-way="cloud"] .both-value')).toHaveText('1,271.88');
  await expect(page.getByTestId('both-compare')).toHaveText('Same value from both: 11 of 11');
  await expect(page.getByTestId('both-note')).toHaveText('The device\'s answer is a recording; the cloud answer was read now, from the silhouette only.');
  await expect(page.getByTestId('both-fallback')).toHaveCount(0);
  await expect(page.getByTestId('pointer-reveal')).toHaveAttribute('data-source', 'RECORDED');

  await expect(page).toHaveURL(/#\/results/, { timeout: 20_000 });
  await expect(page.getByTestId('doc-effect')).toBeVisible();
  expect(await routes()).toEqual(['recorded-device', 'compare-cloud']);
  // One request, with the silhouette only (the prompt of a Send): no value of the paystub.
  expect(cloud.bodies).toHaveLength(1);
  expect(cloud.bodies[0]).toContain('⟦N12⟧');
  expect(cloud.bodies[0]).not.toContain('1,271.88');

  // The record lists the request like a Send (with the technical checks that follow a first cloud
  // request), and the device recording as nothing sent.
  await expect(page.getByTestId('leaving-bar').locator('.count-row .count-sub')).toContainText(/^1 sent with your document’s silhouette · \d+ technical checks?, no personal data/);
  await page.getByRole('button', { name: 'Details' }).click();
  const sheet = page.getByTestId('record-sheet');
  await expect(sheet.getByTestId('record-headline')).toHaveText(/^\d+ requests? left this device$/);
  await expect(sheet.getByText('Recorded on-device reading of the sample paystub')).toBeVisible();
  await expect(sheet.getByText('Recorded cloud reading of the sample paystub')).toHaveCount(0);
  await expect(sheet.locator('li[data-channel="ai-cloud"][data-status="sent"]')).toHaveCount(1);
});

test('no model here, App Check refuses: the recorded cloud reading instead, and the review says why', async ({ page, context }) => {
  await noOnDeviceModel(context);
  await cloudRefusesAppCheck(page);
  const routes = await watchRoutes(page);
  await runAll(page);
  const both = page.getByTestId('both-ways');
  await expect(both).toBeVisible({ timeout: 20_000 });
  await expect(both).toHaveAttribute('data-cloud-live', 'false');
  await expect(page.getByTestId('both-cloud')).toContainText(/gemini-[\w.-]+, recorded /);
  await expect(page.getByTestId('both-cloud-reason')).toHaveText('a recorded cloud reading of the silhouette, nothing sent now');
  await expect(page.getByTestId('both-compare')).toHaveText('Same value from both: 11 of 11');
  await expect(page.getByTestId('both-note')).toHaveText('Both answers are recordings of this silhouette.');
  await expect(page.getByTestId('both-fallback')).toHaveAttribute('data-reason', 'appCheck');
  await expect(page.getByTestId('both-fallback')).toHaveText(
    'The cloud did not answer now (the security check refused the request). Shown instead: the recorded cloud reading of the same silhouette.',
  );
  // The path never stops on the error: the results open.
  await expect(page).toHaveURL(/#\/results/, { timeout: 20_000 });
  await expect(page.getByTestId('doc-effect')).toBeVisible();
  expect(await routes()).toEqual(['recorded-device', 'compare-cloud', 'recorded-cloud']);

  // The record: the refused request, and both recordings.
  await page.getByRole('button', { name: 'Details' }).click();
  const sheet = page.getByTestId('record-sheet');
  await expect(sheet.locator('li[data-channel="ai-cloud"][data-status="failed"]')).toHaveCount(1);
  await expect(sheet.getByText('Recorded on-device reading of the sample paystub')).toBeVisible();
  await expect(sheet.getByText('Recorded cloud reading of the sample paystub')).toBeVisible();
});

for (const [name, reason, fake, text] of [
  ['the quota is used up', 'quota', { status: 429, body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Resource exhausted. Please try again later.' } } }, 'the free quota is used up for now'],
  ['the service fails', 'other', { status: 500, body: { error: { code: 500, status: 'INTERNAL', message: 'Internal error' } } }, 'an error'],
] as const) {
  test(`a model here, ${name}: read now on this device, the cloud's recording instead, and why`, async ({ page }) => {
    await deviceReadsSample(page);
    await fakeCloudModel(page, fake);
    const routes = await watchRoutes(page);
    await runAll(page);
    const both = page.getByTestId('both-ways');
    await expect(both).toBeVisible({ timeout: 20_000 });
    await expect(both).toHaveAttribute('data-live', 'true');
    await expect(page.getByTestId('both-device')).toHaveText('On this device, now');
    await expect(page.getByTestId('both-note')).toHaveText('Read now on this device. The cloud answer is a recording of the same silhouette.');
    await expect(page.getByTestId('both-fallback')).toHaveAttribute('data-reason', reason);
    await expect(page.getByTestId('both-fallback')).toContainText(`(${text})`);
    await expect(page.getByTestId('pointer-reveal')).toHaveAttribute('data-source', 'ON_DEVICE');
    await expect(page).toHaveURL(/#\/results/, { timeout: 20_000 });
    expect(await routes()).toEqual(['device', 'compare-cloud', 'recorded-cloud']);
  });
}

test('a model here, cloud answers: both read now, compared, and where they differ', async ({ page }) => {
  await deviceReadsSample(page);
  const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
  const routes = await watchRoutes(page);
  await runAll(page);
  const both = page.getByTestId('both-ways');
  await expect(both).toBeVisible({ timeout: 20_000 });
  await expect(both).toHaveAttribute('data-live', 'true');
  await expect(both).toHaveAttribute('data-cloud-live', 'true');
  await expect(page.getByTestId('both-device')).toHaveText('On this device, now');
  await expect(page.getByTestId('both-cloud')).toContainText(/gemini-[\w.-]+, read now/);
  await expect(page.getByTestId('both-note')).toHaveText('Both read now: on this device, and in the cloud from the silhouette only.');
  await expect(page.getByTestId('both-compare')).toHaveText('Same value from both: 12 of 12');
  // The values used are the device's.
  await expect(page.getByTestId('pointer-reveal')).toHaveAttribute('data-source', 'ON_DEVICE');
  await expect(page).toHaveURL(/#\/results/, { timeout: 20_000 });
  await expect(page.getByTestId('doc-effect')).toBeVisible();
  expect(await routes()).toEqual(['device', 'compare-cloud']);
  expect(cloud.bodies).toHaveLength(1);
});

test('a model here whose reading fails its checks: the cloud\'s answer is used, as after a Send', async ({ page }) => {
  // The device points gross pay at a date: the checks refuse it.
  const { deductions: _, ...core } = fixturePointers('paystub-en-01-correct');
  await fakeOnDeviceModel(page.context(), {
    availability: 'available',
    systemReplies: { 'answer only the fields in the schema': JSON.stringify({ ...core, grossPay: 'D1', ytdGross: 'D2' }) },
    replies: {},
  });
  await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
  const routes = await watchRoutes(page);
  await runAll(page);
  await expect(page.getByTestId('pointer-reveal')).toHaveAttribute('data-source', 'IN_CLOUD', { timeout: 20_000 });
  await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-reason', 'on-device-failed');
  await expect(page.getByTestId('both-ways')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/results/, { timeout: 20_000 });
  expect(await routes()).toEqual(['device', 'cloud-after-device']);
});

test('no connection: nothing reaches the cloud, the recording is shown, and the review says why', async ({ page, context }) => {
  await noOnDeviceModel(context);
  await fakeFirebaseBackends(page);
  await page.route(`https://${AI_HOST}/**`, (route) => route.abort('internetdisconnected'));
  await runAll(page);
  await expect(page.getByTestId('both-fallback')).toHaveAttribute('data-reason', 'network', { timeout: 20_000 });
  await expect(page.getByTestId('both-fallback')).toContainText('(no connection)');
  await expect(page).toHaveURL(/#\/results/, { timeout: 20_000 });
});

test('no answer within 20 seconds: given up, the recording is shown, and the review says why', async ({ page, context }) => {
  test.setTimeout(90_000);
  await noOnDeviceModel(context);
  await fakeFirebaseBackends(page);
  // The cloud never answers.
  await page.route(`https://${AI_HOST}/**`, () => undefined);
  await runAll(page);
  await expect(page.getByTestId('reading-show')).toHaveAttribute('data-route', 'compare-cloud', { timeout: 10_000 });
  const started = Date.now();
  await expect(page.getByTestId('both-fallback')).toHaveAttribute('data-reason', 'timeout', { timeout: 40_000 });
  expect(Date.now() - started).toBeGreaterThan(15_000);
  await expect(page.getByTestId('both-fallback')).toContainText('(no answer within 20 seconds)');
  await expect(page).toHaveURL(/#\/results/, { timeout: 20_000 });
});

test('the single steps keep working as they did: the recorded cloud reading alone shows no comparison and sends nothing', async ({ page, context }) => {
  await noOnDeviceModel(context);
  const cloud = await cloudRefusesAppCheck(page);
  await page.goto('/#/judges');
  await page.getByRole('button', { name: 'Read the sample paystub' }).first().click();
  await page.getByTestId('use-recorded-cloud').click();
  await expect(page.getByTestId('pointer-reveal')).toHaveAttribute('data-source', 'RECORDED_CLOUD', { timeout: 10_000 });
  await expect(page.getByTestId('both-ways')).toHaveCount(0);
  expect(cloud.bodies).toEqual([]);
});
