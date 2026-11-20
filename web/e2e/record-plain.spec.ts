// "Leaving your device" in plain words before any JSON (contract v1.44, leaving.headline.*, record.*): the
// record opens on whether anything left, and each request on what left as a person reads it (the silhouette
// with its chips) and what stayed; the exact request is folded under "For developers".
import { expect, test } from '@playwright/test';
import { fakeCloudModel, fixturePointers, noOnDeviceModel } from './model-fakes';

test('nothing sent: the record says so in words, not a zero', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('leaving-bar').getByRole('button', { name: 'Details' }).click();
  await expect(page.getByTestId('record-headline')).toHaveText('Nothing has left this device');
  await expect(page.getByTestId('record-only')).toHaveCount(0);
});

test('a reading sent to the cloud: the headline, then the silhouette that left as chips and what stayed, the JSON folded', async ({ page, context }) => {
  await noOnDeviceModel(context);
  const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
  await page.goto('/#/judges');
  await page.getByRole('button', { name: 'Read the sample paystub' }).first().click();
  await page.getByRole('button', { name: /^Send$/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check what was found' })).toBeVisible();
  expect(cloud.bodies).toHaveLength(1);

  await page.getByTestId('leaving-bar').getByRole('button', { name: 'Details' }).click();
  const sheet = page.getByTestId('record-sheet');
  await expect(sheet.getByTestId('record-headline')).toHaveText(/^\d+ requests? left this device$/);
  await expect(sheet.getByTestId('record-only')).toHaveText('Each carried only a silhouette: no names, numbers or dates of yours.');

  // The latest request opens by itself, on what left in plain words.
  const reading = sheet.locator('li[data-channel="ai-cloud"]').filter({ has: page.getByTestId('what-left') }).first();
  const toggle = reading.getByRole('button', { name: 'What left this device' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const doc = reading.getByTestId('what-left-doc');
  await expect(doc).toBeVisible();
  await expect(doc.locator('.tok', { hasText: /^N12$/ })).toBeVisible();
  await expect(doc).toContainText('Gross Pay');
  await expect(doc).not.toContainText('1,271.88');
  await expect(reading.getByTestId('what-stayed')).toHaveText('Kept on this device: 22 numbers, 3 dates, 12 words');
  await expect(reading.getByTestId('payload-meta')).toContainText('Model: ');
  // The exact JSON: closed, under "For developers".
  const technical = reading.getByTestId('record-technical');
  await expect(technical).not.toHaveAttribute('open', /.*/);
  await expect(reading.getByTestId('outbound-payload')).toBeHidden();
  await technical.locator('summary', { hasText: 'For developers: the request as sent' }).click();
  await expect(reading.getByTestId('outbound-payload')).toBeVisible();
  await expect(reading.getByTestId('outbound-payload')).toContainText('"contents"');
  // What the plain view shows is what the body carried.
  expect(cloud.bodies[0]).toContain('Gross Pay');
});

test('a recording is dated when it was recorded, not when it was shown', async ({ page, context }) => {
  await noOnDeviceModel(context);
  await page.goto('/#/judges');
  await page.getByRole('button', { name: 'Read the sample paystub' }).first().click();
  await page.getByTestId('use-recorded-cloud').click();
  await expect(page.getByTestId('pointer-reveal')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('leaving-bar').getByRole('button', { name: 'Details' }).click();
  const sheet = page.getByTestId('record-sheet');
  await expect(sheet.getByTestId('record-headline')).toHaveText('Nothing has left this device');
  await expect(sheet.getByTestId('record-sub')).toHaveText('1 recording shown, nothing sent now');
  const row = sheet.locator('li[data-recorded="true"]');
  await expect(row.locator('.outbound-time')).toHaveText(/^Recorded Nov 19, 2026$/);
  await expect(row.getByRole('button', { name: 'What went to the cloud when it was recorded' })).toHaveAttribute('aria-expanded', 'true');
  await expect(row.getByTestId('what-left-doc')).toContainText('Gross Pay');
});
