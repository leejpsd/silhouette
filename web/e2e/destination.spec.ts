// Where a request goes, beside the button that sends it (contract v1.43 send.destination.*), the exact
// request one press away before anything is sent, and the record opening on the latest request.
import { expect, test } from '@playwright/test';
import { fakeCloudModel, fakeOnDeviceModel, fixturePointers, noOnDeviceModel } from './model-fakes';

async function openSample(page: import('@playwright/test').Page) {
  await page.goto('/#/judges');
  await page.getByRole('button', { name: 'Read the sample paystub' }).click();
  await expect(page.getByTestId('skeleton-preview')).toBeVisible();
}

test('no model here: the preview says the silhouette goes to the cloud, and shows the exact request with no value in it', async ({ page, context }) => {
  await noOnDeviceModel(context);
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && !r.url().startsWith(new URL(page.url()).origin)) requests.push(r.url());
  });
  await openSample(page);
  const line = page.getByTestId('preview-destination');
  await expect(line).toHaveAttribute('data-destination', 'cloud');
  await expect(line).toContainText('Goes to Firebase AI Logic in the cloud: only the lines below');
  await page.getByTestId('preview-exact-request').getByRole('button', { name: 'Show the exact request' }).click();
  const payload = page.getByTestId('preview-payload');
  await expect(payload).toContainText('⟦N12⟧');
  await expect(payload).not.toContainText('1,271.88');
  await expect(payload).not.toContainText('Maria');
  // Showing it sends nothing.
  expect(requests).toEqual([]);
});

test('a model here: the preview says the reading stays on this device', async ({ page, context }) => {
  await fakeOnDeviceModel(context, { availability: 'available', systemReplies: {}, replies: {} });
  await openSample(page);
  const line = page.getByTestId('preview-destination');
  await expect(line).toHaveAttribute('data-destination', 'device');
  await expect(line).toContainText('Stays on this device: its own model answers');
});

test('the record opens on the latest request, with where it went and what it carried', async ({ page, context }) => {
  await noOnDeviceModel(context);
  await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
  await openSample(page);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'IN_CLOUD');
  await page.getByRole('button', { name: 'Details' }).click();
  const payload = page.getByTestId('outbound-payload').first();
  await expect(payload).toBeVisible();
  await expect(payload).toContainText('⟦N12⟧');
  await expect(payload).not.toContainText('1,271.88');
});
