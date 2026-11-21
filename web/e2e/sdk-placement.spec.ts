// Device-first tasks are placed by Firebase AI Logic itself (PREFER_ON_DEVICE), with the real SDK in the
// page: the badge shows the `inferenceSource` it reports, and a device answer that fails is still sent on
// to the cloud once by the app (routing.json onDeviceFailure), which the SDK never does on its own.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { completeQuickCheck } from './helpers';
import { fakeAnswerModels, fakeCloudModel, fakeOnDeviceModel, fixturePointers, noOnDeviceModel } from './model-fakes';

/** The first line of the system instruction of shared/prompts/pointer-extract.v5.md. */
const v5System = readFileSync(new URL('../../shared/prompts/pointer-extract.v5.md', import.meta.url), 'utf8').split('## System instruction')[1]?.trim().split('\n')[0] ?? '';

interface Body {
  systemInstruction?: { parts?: { text?: string }[] };
  generationConfig?: Record<string, unknown>;
}

async function openProgram(page: Page, id: string) {
  await page.goto(`/#/program/${id}`);
  await expect(page.getByTestId('verdict-card')).toBeVisible();
}

test('no on-device model: the SDK sends the whole reading of the silhouette to the cloud in one request; the badge says IN_CLOUD and why', async ({ page, context }) => {
  await noOnDeviceModel(context);
  const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
  await page.goto('/#/doc');
  await page.getByRole('button', { name: 'English paystub (text)' }).click();
  await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
  const badge = page.getByTestId('inference-badge');
  await expect(badge).toHaveAttribute('data-source', 'IN_CLOUD');
  await expect(badge).toHaveAttribute('data-reason', 'document-silhouette-only');
  await expect(badge).toHaveAttribute('data-detail', 'no-device-model');
  await expect(page.getByTestId('value-grossPay')).toHaveText('1,271.88');
  // One request: the single cloud pass (the shared instruction, the whole schema with the deductions),
  // not a part of the device's reading.
  expect(cloud.bodies).toHaveLength(1);
  const body = JSON.parse(cloud.bodies[0] ?? '{}') as Body;
  const system = body.systemInstruction?.parts?.map((p) => p.text ?? '').join('\n') ?? '';
  expect(system).not.toContain('answer only the fields in the schema');
  expect(v5System.length).toBeGreaterThan(20);
  expect(system).toContain(v5System);
  expect(JSON.stringify(body.generationConfig)).toContain('"deductions"');
  expect(cloud.bodies[0]).not.toContain('1,271.88');
});

test('a device-first explanation: the SDK answers on this device when it can; when the device fails, the app sends it on to the cloud once', async ({ page, context }) => {
  await fakeOnDeviceModel(context, { availability: 'available', replies: {}, throwMessage: 'The input is too large.' });
  const cloud = await fakeAnswerModels(page);
  await page.goto('/');
  await completeQuickCheck(page);
  await openProgram(page, 'utility-discount');
  await page.getByRole('button', { name: 'Explain this program' }).click();
  await expect(page.getByTestId('send-panel')).toHaveAttribute('data-destination', 'device-first');
  await page.getByRole('button', { name: 'Send' }).click();
  const answer = page.getByTestId('explain-short').getByTestId('answer');
  await expect(answer).toBeVisible();
  const badge = answer.getByTestId('inference-badge');
  await expect(badge).toHaveAttribute('data-source', 'IN_CLOUD');
  await expect(badge).toHaveAttribute('data-reason', 'on-device-failed');
  // The device was asked (by the SDK), then exactly one request went to the cloud.
  const prompts = await page.evaluate(() => (window as unknown as { __fakePrompts: string[] }).__fakePrompts);
  expect(prompts.length).toBeGreaterThan(0);
  expect(cloud.bodies).toHaveLength(1);
});
