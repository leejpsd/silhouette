// "Run all three steps" (contract v1.43 judges.runAll, v1.44 review.both.*): one press from the judges' page
// to the results with what the paystub changed. Both halves of the hybrid are read, one after the other:
// without a model here the recorded on-device reading and then the recorded cloud reading (nothing sent);
// with one, this device reads it now and the cloud's half is the recording. The review then shows the two
// answers side by side and uses the device's.
import { expect, test, type Page } from '@playwright/test';
import { fakeOnDeviceModel, fixturePointers, noOnDeviceModel } from './model-fakes';

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

test('no model here: one press plays the recorded device reading, then the recorded cloud reading, compares them and opens the results, sending nothing', async ({ page, context }) => {
  await noOnDeviceModel(context);
  const routes = await watchRoutes(page);
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && !r.url().startsWith(new URL(page.url()).origin)) posts.push(r.url());
  });
  await page.goto('/#/judges');
  await page.getByTestId('judges-run-all').getByRole('button', { name: 'Run all three steps' }).click();
  // The device's half first, naming the machine it was recorded on; then the cloud's half.
  await expect(page.getByTestId('reading-show')).toHaveAttribute('data-route', 'recorded-device');
  await expect(page.getByTestId('reading-show-stage')).toContainText(/Chrome \d+/);
  await expect(page.getByTestId('reading-show')).toHaveAttribute('data-route', 'recorded-cloud', { timeout: 10_000 });
  await expect(page.getByTestId('reading-show-badge')).toHaveText('Recorded in the cloud');

  // The review: both answers side by side, compared value by value.
  const both = page.getByTestId('both-ways');
  await expect(both).toBeVisible({ timeout: 10_000 });
  await expect(both.getByRole('heading', { name: 'Read both ways' })).toBeVisible();
  await expect(page.getByTestId('both-device')).toContainText('On a device');
  await expect(page.getByTestId('both-device')).toContainText(/recorded on Chrome \d+ · Mac, /);
  await expect(page.getByTestId('both-cloud')).toContainText('In the cloud');
  await expect(page.getByTestId('both-cloud')).toContainText(/gemini-[\w.-]+, recorded /);
  const gross = page.getByTestId('both-row-grossPay');
  await expect(gross).toContainText('N12');
  await expect(gross.locator('[data-way="device"] .both-value')).toHaveText('1,271.88');
  await expect(gross.locator('[data-way="cloud"] .both-value')).toHaveText('1,271.88');
  // The recorded device answer has no deductions (read in a second part on a device): they are not compared.
  await expect(page.getByTestId('both-compare')).toHaveText('Same value from both: 11 of 11');
  await expect(both).toContainText("The values below are the device's answer.");
  await expect(both).toContainText('Both answers are recordings of this silhouette. Nothing is sent now.');
  // The values used are the device's: the badge says so.
  await expect(page.getByTestId('pointer-reveal')).toHaveAttribute('data-source', 'RECORDED');

  await expect(page).toHaveURL(/#\/results/, { timeout: 20_000 });
  await expect(page.getByTestId('doc-effect')).toBeVisible();
  expect(await routes()).toEqual(['recorded-device', 'recorded-cloud']);
  expect(posts.filter((u) => u.includes('generativelanguage') || u.includes('firebasevertexai') || u.includes('aiplatform'))).toEqual([]);

  // The record lists both recordings, nothing sent now.
  await page.getByRole('button', { name: 'Details' }).click();
  const sheet = page.getByTestId('record-sheet');
  await expect(sheet.getByTestId('record-headline')).toHaveText('Nothing has left this device');
  await expect(sheet.getByTestId('record-sub')).toContainText('2 recordings shown, nothing sent now');
  await expect(sheet.getByText('Recorded on-device reading of the sample paystub')).toBeVisible();
  await expect(sheet.getByText('Recorded cloud reading of the sample paystub')).toBeVisible();
});

test('a model here: one press reads the sample on this device now, then plays the recorded cloud reading, and says where they differ', async ({ page, context }) => {
  const { deductions, ...core } = fixturePointers('paystub-en-01-correct');
  await fakeOnDeviceModel(context, {
    availability: 'available',
    systemReplies: { 'answer only the fields in the schema': JSON.stringify(core), 'answer only the deductions': JSON.stringify({ deductions }) },
    replies: {},
  });
  const routes = await watchRoutes(page);
  await page.goto('/#/judges');
  await page.getByTestId('judges-run-all').getByRole('button', { name: 'Run all three steps' }).click();
  const both = page.getByTestId('both-ways');
  await expect(both).toBeVisible({ timeout: 20_000 });
  await expect(both).toHaveAttribute('data-live', 'true');
  await expect(page.getByTestId('both-device')).toHaveText('On this device, now');
  await expect(both).toContainText('Read now on this device. The cloud answer is a recording of the same silhouette; nothing is sent now.');
  // This device read the deductions too; its last one is a different kind from the cloud's recording: said so.
  await expect(page.getByTestId('both-compare')).toHaveText('Same value from both: 11 of 12');
  await expect(page.getByTestId('both-differs')).toHaveText('Different: Deductions. The checks below decide what is used.');
  await expect(page.getByTestId('pointer-reveal')).toHaveAttribute('data-source', 'ON_DEVICE');
  await expect(page).toHaveURL(/#\/results/, { timeout: 20_000 });
  await expect(page.getByTestId('doc-effect')).toBeVisible();
  expect(await routes()).toEqual(['device', 'recorded-cloud']);
});

test('the single steps keep working as they did: the recorded cloud reading alone shows no comparison', async ({ page, context }) => {
  await noOnDeviceModel(context);
  await page.goto('/#/judges');
  await page.getByRole('button', { name: 'Read the sample paystub' }).first().click();
  await page.getByTestId('use-recorded-cloud').click();
  await expect(page.getByTestId('pointer-reveal')).toHaveAttribute('data-source', 'RECORDED_CLOUD', { timeout: 10_000 });
  await expect(page.getByTestId('both-ways')).toHaveCount(0);
});
