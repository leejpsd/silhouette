// The reading shown as it happens (preview.stage.*): the silhouette going to the model on this device or
// in the cloud, the placeholders coming back and turning into the values here, then the review. For real
// readings and for the recorded ones; never delaying an error; as text when reduced motion is asked for.
import { expect, test, type Page } from '@playwright/test';
import { AI_HOST, fakeCloudModel, fakeOnDeviceModel, fixturePointers, geminiResponse, noOnDeviceModel } from './model-fakes';

/** Set SHOTS_DIR to keep a frame of each stage (design review); nothing is written otherwise. */
const shot = async (page: Page, name: string) => {
  const dir = process.env['SHOTS_DIR'];
  if (dir) await page.screenshot({ path: `${dir}/${name}-${test.info().project.name}.png` });
};

async function openSample(page: Page) {
  await page.goto('/#/judges');
  await page.getByRole('button', { name: 'Read the sample paystub' }).click();
  await expect(page.getByTestId('skeleton-preview')).toBeVisible();
}

test.describe('the reading shown as it happens', () => {
  test('to the cloud: the silhouette crosses the dashed edge to Firebase AI Logic, placeholders come back and turn into values here', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const bodies: string[] = [];
    await fakeCloudModel(page, { pointers: {} });
    // The cloud answers after a moment, so the way out can be seen.
    await page.route(`https://${AI_HOST}/**`, async (route) => {
      bodies.push(route.request().postData() ?? '');
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(geminiResponse(fixturePointers('paystub-en-01-correct'))) });
    });
    await openSample(page);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const show = page.getByTestId('reading-show');
    await expect(show).toHaveAttribute('data-way', 'cloud');
    await expect(show).toHaveAttribute('data-phase', 'out');
    await expect(show.getByTestId('reading-show-badge')).toHaveText('Cloud');
    await expect(show.getByTestId('reading-show-stage')).toHaveText('The silhouette goes to Firebase AI Logic in the cloud…');
    await expect(show.getByTestId('reading-show-model')).toContainText('Firebase AI Logic');
    // What travels is the silhouette: placeholders, never a value.
    await expect(show.getByTestId('reading-show-lines')).toContainText(/N\d+/);
    await expect(show).not.toContainText('1,271.88');
    await page.waitForTimeout(400);
    await shot(page, 'reading-cloud-out');
    await expect(show).toHaveAttribute('data-phase', 'back', { timeout: 5000 });
    await expect(show.getByTestId('reading-show-stage')).toHaveText('The model answered with placeholders. Putting the values back on this device…');
    const gross = show.getByTestId('reading-show-pairs').locator('li').first();
    await expect(gross).toContainText('Gross pay this period');
    await expect(gross).toContainText('1,271.88');
    await page.waitForTimeout(1000);
    await shot(page, 'reading-cloud-back');
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'IN_CLOUD');
    await expect(show).toHaveCount(0);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toContain('1,271.88');
  });

  test('on this device: one ink block, the model inside it, nothing sent', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'available', replies: { 'Document type: paystub': JSON.stringify(fixturePointers('paystub-en-01-correct')) } });
    await page.goto('/#/doc');
    await expect(page.getByTestId('model-status')).toHaveAttribute('data-status', 'available');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await page.getByRole('button', { name: 'Read on this device' }).click();
    const show = page.getByTestId('reading-show');
    await expect(show).toHaveAttribute('data-way', 'device');
    await expect(show.getByTestId('reading-show-badge')).toHaveText('On this device');
    await expect(show.getByTestId('reading-show-model')).toContainText('Model on this device');
    await shot(page, 'reading-device-out');
    await expect(show).toHaveAttribute('data-phase', 'back');
    await expect(show.getByTestId('reading-show-stage')).toContainText('Putting the values back on this device');
    await page.waitForTimeout(1000);
    await shot(page, 'reading-device-back');
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'ON_DEVICE');
    await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');
  });

  test('a reading the device could not do reliably turns to the cloud on the way', async ({ page, context }) => {
    const correct = fixturePointers('paystub-en-01-correct');
    await fakeOnDeviceModel(context, { availability: 'available', systemReplies: { 'answer only the fields in the schema': JSON.stringify({ ...correct, ytdGross: correct['netPay'] }) }, replies: {} });
    await fakeCloudModel(page, { pointers: correct });
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await page.getByRole('button', { name: 'Read on this device' }).click();
    const show = page.getByTestId('reading-show');
    await expect(show).toHaveAttribute('data-route', 'cloud-after-device');
    await expect(show).toHaveAttribute('data-way', 'cloud');
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'IN_CLOUD');
  });

  test('the recorded readings are staged too: on a device (the machine named) and in the cloud, nothing sent now', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await openSample(page);
    await page.getByTestId('use-recorded').click();
    const show = page.getByTestId('reading-show');
    await expect(show).toHaveAttribute('data-route', 'recorded-device');
    await expect(show.getByTestId('reading-show-badge')).toHaveText('Recorded on a device');
    await expect(show.getByTestId('reading-show-stage')).toContainText('Nothing is sent now.');
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'RECORDED');

    await openSample(page);
    await page.getByTestId('use-recorded-cloud').click();
    await expect(show).toHaveAttribute('data-route', 'recorded-cloud');
    await expect(show).toHaveAttribute('data-way', 'cloud');
    await expect(show.getByTestId('reading-show-badge')).toHaveText('Recorded in the cloud');
    await expect(show).toHaveAttribute('data-phase', 'back');
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'RECORDED_CLOUD');
    expect(cloud.bodies).toEqual([]);
  });

  test('an error is shown at once, never delayed by the staging', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeCloudModel(page, { status: 503, body: { error: { code: 503, status: 'UNAVAILABLE', message: 'The model is overloaded. Please try again later.' } } });
    await openSample(page);
    const start = Date.now();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByTestId('task-error')).toBeVisible();
    expect(Date.now() - start).toBeLessThan(900);
    await expect(page.getByTestId('reading-show')).toHaveCount(0);
  });

  test('with reduced motion the stages are text and nothing travels', async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await noOnDeviceModel(context);
    await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await openSample(page);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const show = page.getByTestId('reading-show');
    await expect(show.getByTestId('reading-show-stage')).toHaveText('The silhouette goes to Firebase AI Logic in the cloud…');
    await expect(show.locator('.rs-packet').first()).toBeHidden();
    await expect(show).toHaveAttribute('data-phase', 'back');
    await expect(show.getByTestId('reading-show-pairs').locator('li').first()).toContainText('1,271.88');
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'IN_CLOUD');
  });
});
