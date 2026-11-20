// What a person meets on the main path: one honest status of Chrome's on-device model on every screen,
// the start screen's sample paystub ending in results, the way on after a failed Send, the record of a
// recorded reading, and how App Check guards the cloud.
import { expect, test, type Page } from '@playwright/test';
import { completeQuickCheck, confirmAllValues, verdictOf } from './helpers';
import { fakeCloudModel, fakeOnDeviceModel, fixturePointers, noOnDeviceModel } from './model-fakes';

/** Lines that would say this browser has no model at all (false while Chrome can download it). */
const NO_MODEL = /No on-device model|no model on this device|doesn't have one|has no on-device/;

async function openRecord(page: Page) {
  await page.getByTestId('leaving-bar').getByRole('button', { name: 'Details' }).click();
  const record = page.getByTestId('record-sheet');
  await expect(record).toBeVisible();
  return record;
}

test.describe('the on-device model, said the same way everywhere', () => {
  test('where Chrome can download the model: the judges’ page, the preview and a program page say "not downloaded yet", and the preview offers the download', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'downloadable', replies: {} });
    await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await page.goto('/#/judges');
    await expect(page.getByTestId('judges-device')).toHaveAttribute('data-device', 'downloadable');
    await expect(page.getByTestId('judges-device')).toContainText('This browser can download Chrome’s on-device model');

    await page.getByRole('button', { name: 'Read the sample paystub' }).click();
    await expect(page.getByTestId('skeleton-preview')).toBeVisible();
    // The recorded reading says why it is offered, truly; the download stands beside it, not folded away.
    await expect(page.getByTestId('use-recorded-card')).toContainText('Chrome’s on-device model is not downloaded yet.');
    const status = page.getByTestId('model-status');
    await expect(status).toHaveCount(1);
    await expect(status).toHaveAttribute('data-status', 'downloadable');
    await expect(status.getByRole('button', { name: 'Download the on-device model' })).toBeVisible();
    await expect(page.getByTestId('preview-more').getByTestId('model-status')).toHaveCount(0);
    await page.getByTestId('preview-more').locator('summary').click();
    await expect(page.getByTestId('preview-more')).toContainText('Chrome’s on-device model is not downloaded yet, so the silhouette will be sent');
    expect(await page.locator('main').innerText()).not.toMatch(NO_MODEL);

    // Downloaded: the reading starts on this device, and the recording is no longer offered in its place.
    await status.getByRole('button', { name: 'Download the on-device model' }).click();
    await expect(page.getByTestId('read-here')).toBeVisible();
    await expect(page.getByTestId('use-recorded')).toHaveCount(0);
    await expect(page.getByTestId('model-status')).toHaveAttribute('data-status', 'available');
  });

  test('a program page in that browser says the model is not downloaded yet, offers it, and opens the typed question once it is', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'downloadable', replies: {} });
    await page.goto('/');
    await completeQuickCheck(page);
    await page.goto('/#/program/utility-discount');
    await expect(page.getByTestId('verdict-card')).toBeVisible();
    await expect(page.getByTestId('why-unavailable')).toContainText('Chrome’s on-device model is not downloaded yet');
    await expect(page.getByTestId('free-text-unavailable')).toContainText('Chrome’s on-device model is not downloaded yet');
    expect(await page.locator('main').innerText()).not.toMatch(NO_MODEL);
    await page.getByTestId('model-status').getByRole('button', { name: 'Download the on-device model' }).click();
    await expect(page.getByTestId('free-text-unavailable')).toHaveCount(0);
    await expect(page.getByTestId('why-unavailable')).toHaveCount(0);
  });

  test('a browser without the model still says so plainly', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.goto('/#/judges');
    await page.getByRole('button', { name: 'Read the sample paystub' }).click();
    await expect(page.getByTestId('use-recorded-card')).toContainText('No on-device model in this browser.');
    await expect(page.getByTestId('model-status')).toHaveAttribute('data-status', 'unavailable');
    await expect(page.getByTestId('model-status').getByRole('button')).toHaveCount(0);
  });
});

test.describe('the start screen’s sample paystub', () => {
  test('with nothing answered yet, it fills the invented household and the reading ends in results that may qualify', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await page.goto('/');
    await page.getByRole('button', { name: 'Try with a sample paystub' }).click();
    // Straight to the silhouette, not to a page of samples.
    await expect(page.getByTestId('skeleton-preview')).toHaveAttribute('data-mode', 'leave');
    await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'IN_CLOUD');
    expect(cloud.bodies.join('\n')).not.toContain('1,271.88');
    await confirmAllValues(page);
    await page.getByRole('button', { name: 'Check these values' }).click();
    await page.getByRole('button', { name: /^Use \$[\d,]+ as my yearly income$/ }).click();
    await expect(page).toHaveURL(/#\/results/);
    await expect(page.locator('[data-testid^="program-"][data-verdict="likely"]').first()).toBeVisible();
    await expect(page.locator('main')).toContainText('May qualify');
    // Not every program waits for an answer.
    const all = await page.locator('li[data-testid^="program-"]').count();
    const waiting = await page.locator('li[data-testid^="program-"][data-verdict="depends"]').count();
    expect(waiting).toBeLessThan(all);
    // The person's own path: the judges' next-step cards are not shown.
    await expect(page.getByTestId('judge-primary')).toHaveCount(0);
  });

  test('with answers already given, it keeps them and opens the sample directly', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.goto('/');
    await completeQuickCheck(page, { resident: 'No' });
    await expect(verdictOf(page, 'food-help')).toHaveAttribute('data-verdict', 'unlikely');
    // Within the app (no reload): home, the sample, then the results again.
    await page.evaluate(() => (location.hash = '#/'));
    await page.getByRole('button', { name: 'Try with a sample paystub' }).click();
    await expect(page.getByTestId('skeleton-preview')).toBeVisible();
    await page.evaluate(() => (location.hash = '#/results'));
    await expect(verdictOf(page, 'food-help')).toHaveAttribute('data-verdict', 'unlikely');
  });
});

test.describe('after a failed Send', () => {
  test('the error offers the recorded on-device reading, and the dock says "Try again" instead of "Send"', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeCloudModel(page, { status: 503, body: { error: { code: 503, status: 'UNAVAILABLE', message: 'The model is overloaded. Please try again later.' } } });
    await page.goto('/#/judges');
    await page.getByRole('button', { name: 'Read the sample paystub' }).click();
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('task-error')).toBeVisible();
    await expect(page.getByTestId('retry')).toHaveText('Try again');
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toHaveCount(0);
    const recorded = page.getByTestId('error-use-recorded');
    await expect(recorded).toHaveText('Continue with the recorded on-device reading (nothing sent)');
    const tried = cloud.bodies.length;
    await recorded.click();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'RECORDED');
    // The recorded reading sends nothing: no new request to the model, on the network or in the record.
    expect(cloud.bodies).toHaveLength(tried);
    const record = await openRecord(page);
    await expect(record.getByTestId('outbound-list').locator('li[data-channel="ai-cloud"]')).toHaveCount(tried);
    await expect(record.getByTestId('outbound-list').locator('li[data-status="answered"]')).toContainText('Recorded on-device reading of the sample paystub');
  });
});

test.describe('"Compare what left" after the recorded reading', () => {
  test('the record lists the recorded reading with its machine and date, and nothing as sent', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await page.goto('/#/judges');
    await page.getByRole('button', { name: 'Read the sample paystub' }).click();
    await page.getByTestId('use-recorded').click();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'RECORDED');
    expect(cloud.bodies).toEqual([]);
    const bar = page.getByTestId('leaving-bar');
    await expect(bar).toHaveAttribute('data-outbound-count', '0');
    await expect(bar).toHaveAttribute('data-kept-count', '1');
    const record = await openRecord(page);
    await expect(record.getByTestId('record-headline')).toHaveText('Nothing has left this device');
    await expect(record.getByTestId('record-sub')).toHaveText('1 recording shown, nothing sent now');
    // Dated when it was recorded, not when it was shown.
    await expect(record.locator('li[data-recorded="true"] .outbound-time')).toHaveText(/^Recorded .+ UTC$/);
    const item = record.getByTestId('outbound-list').locator('li[data-status="answered"]');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('Recorded on-device reading of the sample paystub');
    await expect(item.getByTestId('outbound-status')).toHaveText('Nothing sent');
    await expect(item.getByTestId('recorded-note')).toHaveText(/^The on-device model’s answer, recorded on Chrome \d+ · \w+ \(.+\)\. This device put the values back; nothing was sent\.$/);
  });
});

test.describe('how the routing is enforced', () => {
  test('#/tasks says every cloud request carries a limited-use App Check token, listed in the record', async ({ page }) => {
    await page.goto('/#/tasks');
    const item = page.getByTestId('enforced-appcheck');
    await expect(item).toContainText('Every cloud request carries an App Check token (reCAPTCHA Enterprise on the web)');
    await expect(item).toContainText('limited-use');
    await expect(item).toContainText('listed in “Leaving your device”');
  });
});
