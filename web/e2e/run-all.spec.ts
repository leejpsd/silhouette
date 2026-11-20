// "Run all three steps" (contract v1.43 judges.runAll): one press from the judges' page to the results
// with what the paystub changed. Without a model here the sample is read from a recording (nothing sent);
// with one, on this device.
import { expect, test } from '@playwright/test';
import { fakeOnDeviceModel, fixturePointers, noOnDeviceModel } from './model-fakes';

test('no model here: one press reads the recorded reading, uses its values and opens the results, sending nothing', async ({ page, context }) => {
  await noOnDeviceModel(context);
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && !r.url().startsWith(new URL(page.url()).origin)) posts.push(r.url());
  });
  await page.goto('/#/judges');
  await page.getByTestId('judges-run-all').getByRole('button', { name: 'Run all three steps' }).click();
  await expect(page.getByTestId('reading-show')).toBeVisible();
  await expect(page).toHaveURL(/#\/results/, { timeout: 20_000 });
  await expect(page.getByTestId('doc-effect')).toBeVisible();
  expect(posts.filter((u) => u.includes('generativelanguage') || u.includes('firebasevertexai') || u.includes('aiplatform'))).toEqual([]);
});

test('a model here: one press reads the sample on this device and opens the results', async ({ page, context }) => {
  const { deductions, ...core } = fixturePointers('paystub-en-01-correct');
  await fakeOnDeviceModel(context, {
    availability: 'available',
    systemReplies: { 'answer only the fields in the schema': JSON.stringify(core), 'answer only the deductions': JSON.stringify({ deductions }) },
    replies: {},
  });
  await page.goto('/#/judges');
  await page.getByTestId('judges-run-all').getByRole('button', { name: 'Run all three steps' }).click();
  await expect(page).toHaveURL(/#\/results/, { timeout: 20_000 });
  await expect(page.getByTestId('doc-effect')).toBeVisible();
});
