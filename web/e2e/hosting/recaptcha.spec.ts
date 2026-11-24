// The hosting build (mode hosting, with a site key) under the hosting content security policy, with
// reCAPTCHA Enterprise and App Check answering in the shapes they use in production. The policy must
// let every request they make through, App Check's token must reach Firebase AI Logic, and the record
// must say plainly what each request was. A failed first exchange is followed by a successful one
// after "Try again", without reloading.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { AI_HOST, fakeCloudModel, fixturePointers, noOnDeviceModel } from '../model-fakes';
import { APP_CHECK_TOKEN, fakeRecaptcha, requireAppCheck, serveWithPolicy } from './recaptcha';

const hosting = JSON.parse(readFileSync(new URL('../../hosting/firebase.hosting.json', import.meta.url), 'utf8')) as {
  hosting: { headers: { source: string; headers: { key: string; value: string }[] }[] };
};
const POLICY = hosting.hosting.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')?.value ?? '';

async function judgesStepTwo(page: Page) {
  await page.goto('/#/judges');
  await page.getByRole('button', { name: 'Read the sample paystub' }).click();
  await page.getByTestId('skeleton-preview').waitFor();
  await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
}

test('reCAPTCHA Enterprise and App Check work under the hosting policy; the record names each request', async ({ page, context, baseURL }) => {
  await noOnDeviceModel(context);
  const violations = await serveWithPolicy(page, POLICY, new URL(baseURL ?? '').origin);
  const recaptcha = await fakeRecaptcha(context, page);
  await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
  const aiHeaders: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).hostname === AI_HOST) aiHeaders.push(r.headers()['x-firebase-appcheck'] ?? '');
  });

  await judgesStepTwo(page);
  await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'IN_CLOUD');
  await expect(page.getByTestId('value-grossPay')).toHaveText('1,271.88');

  // Every request reCAPTCHA and App Check make, in production's shapes, and none refused by the policy.
  const seen = recaptcha.requests.join('\n');
  for (const part of ['/recaptcha/enterprise.js?render=explicit', 'www.gstatic.com/recaptcha/releases/', '/recaptcha/enterprise/anchor', '/recaptcha/enterprise/clr', '/recaptcha/enterprise/reload', 'exchangeRecaptchaEnterpriseToken']) {
    expect(seen, part).toContain(part);
  }
  expect(violations).toEqual([]);
  expect(aiHeaders).toEqual([APP_CHECK_TOKEN]);
  // Exactly one token exchange, before the one request to Firebase AI Logic.
  expect(recaptcha.exchanges).toEqual([200]);
  const exchangeAt = recaptcha.requests.findIndex((u) => u.includes('exchangeRecaptchaEnterpriseToken'));
  expect(exchangeAt).toBeGreaterThan(-1);

  // The count: the one request with the silhouette, apart from the technical checks.
  await expect(page.getByTestId('leaving-bar').locator('.count-row .count-sub')).toContainText(/^1 sent with your document’s silhouette · \d+ technical checks, no personal data$/);
  // The record: reCAPTCHA in plain words, never a bare host name, and nothing refused.
  await page.getByTestId('leaving-bar').getByRole('button', { name: 'Details' }).click();
  const list = page.getByTestId('outbound-list');
  await expect(list.locator('li[data-channel="recaptcha"]').first()).toContainText('A check that this is the real app (reCAPTCHA, no personal data)');
  await expect(list.locator('li[data-channel="app-check"]').first()).toContainText('App Check token request (no personal data)');
  await expect(page.getByTestId('recaptcha-note')).toBeVisible();
  await expect(list.locator('li[data-status="blocked"]')).toHaveCount(0);
  for (const title of await list.locator('li .outbound-what').allInnerTexts()) expect(title).not.toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
});

test('the policy without reCAPTCHA in connect-src is caught: the call is refused, and the record says it never left', async ({ page, context, baseURL }) => {
  await noOnDeviceModel(context);
  // The policy of the first hosted release, before connect-src allowed https://www.google.com/recaptcha/.
  const oldPolicy = POLICY.replace(/(connect-src[^;]*?) https:\/\/www\.google\.com\/recaptcha\//, '$1');
  expect(oldPolicy).not.toBe(POLICY);
  const violations = await serveWithPolicy(page, oldPolicy, new URL(baseURL ?? '').origin);
  await fakeRecaptcha(context, page);
  const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
  await requireAppCheck(page);
  await judgesStepTwo(page);
  await expect(page.getByTestId('task-error')).toHaveAttribute('data-kind', 'app-check');
  await expect.poll(() => violations.join('\n')).toContain('https://www.google.com/recaptcha/enterprise/clr');
  // Without a token the silhouette is not sent at all: no request with a placeholder token.
  expect(cloud.bodies).toEqual([]);
  await page.getByTestId('leaving-bar').getByRole('button', { name: 'Details' }).click();
  const refused = page.getByTestId('outbound-list').locator('li[data-channel="recaptcha"][data-status="blocked"]');
  await expect(refused.first()).toContainText('Not sent: the browser refused it under this site’s security rules');
});

test('after a failed App Check exchange, "Try again" works without reloading, and the message names the cause', async ({ page, context, baseURL }) => {
  await noOnDeviceModel(context);
  await serveWithPolicy(page, POLICY, new URL(baseURL ?? '').origin);
  const recaptcha = await fakeRecaptcha(context, page, [400, 200]);
  const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
  await requireAppCheck(page);
  await judgesStepTwo(page);
  const error = page.getByTestId('task-error');
  await expect(error).toHaveAttribute('data-kind', 'app-check');
  // The failed exchange sent no silhouette: no request to Firebase AI Logic left, on the network or in the record.
  expect(cloud.bodies).toEqual([]);
  await page.getByTestId('leaving-bar').getByRole('button', { name: 'Details' }).click();
  await expect(page.getByTestId('outbound-list').locator('li[data-channel="ai-cloud"]:not([data-status="blocked"])')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hide details' }).click();
  // The test browser is driven by automation software: the message says that is why, that nothing was
  // sent, and what to do (never that the app is not genuine).
  await expect(error).toContainText('because automation software is controlling it');
  await expect(error).toContainText('The silhouette was not sent.');
  await expect(error).not.toContainText('genuine');
  // Straight away: the SDK would still be throttling the failed provider; the app starts it again.
  await page.getByTestId('retry').click();
  await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'IN_CLOUD');
  await expect(page.getByTestId('value-grossPay')).toHaveText('1,271.88');
  // One exchange per cloud request (limited-use tokens, no background refresh): the failed one, then one that worked.
  expect(recaptcha.exchanges).toEqual([400, 200]);
  expect(cloud.bodies).toHaveLength(1);
});

// Contract v1.47 (routing.json bothWays): the one-press judges' path reads the cloud half live, through the
// same App Check gate as a Send.
async function runAll(page: Page) {
  await page.goto('/#/judges');
  await page.getByTestId('judges-run-all').getByRole('button', { name: 'Run all three steps' }).click();
}

test('one press: the cloud half is read now with an App Check token, and the record lists the request', async ({ page, context, baseURL }) => {
  await noOnDeviceModel(context);
  await serveWithPolicy(page, POLICY, new URL(baseURL ?? '').origin);
  const recaptcha = await fakeRecaptcha(context, page);
  const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
  await requireAppCheck(page);
  const aiHeaders: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).hostname === AI_HOST) aiHeaders.push(r.headers()['x-firebase-appcheck'] ?? '');
  });
  await runAll(page);
  await expect(page.getByTestId('both-ways')).toHaveAttribute('data-cloud-live', 'true', { timeout: 20_000 });
  await expect(page.getByTestId('both-cloud')).toContainText(/gemini-[\w.-]+, read now/);
  await expect(page).toHaveURL(/#\/results/, { timeout: 20_000 });
  expect(aiHeaders).toEqual([APP_CHECK_TOKEN]);
  expect(recaptcha.exchanges).toEqual([200]);
  expect(cloud.bodies).toHaveLength(1);
  await expect(page.getByTestId('leaving-bar').locator('.count-row .count-sub')).toContainText(/^1 sent with your document’s silhouette/);
});

test('one press in an automated browser: App Check refuses, nothing leaves, the recording is shown and the review says why', async ({ page, context, baseURL }) => {
  await noOnDeviceModel(context);
  await serveWithPolicy(page, POLICY, new URL(baseURL ?? '').origin);
  const recaptcha = await fakeRecaptcha(context, page, [403, 200]);
  const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
  await requireAppCheck(page);
  await runAll(page);
  const fallback = page.getByTestId('both-fallback');
  await expect(fallback).toHaveAttribute('data-reason', 'appCheck', { timeout: 20_000 });
  await expect(fallback).toContainText('(the security check refused the request)');
  await expect(page.getByTestId('both-cloud')).toContainText(/gemini-[\w.-]+, recorded /);
  await expect(page).toHaveURL(/#\/results/, { timeout: 20_000 });
  // The silhouette never left: no request reached Firebase AI Logic.
  expect(cloud.bodies).toEqual([]);
  expect(recaptcha.exchanges).toEqual([403]);
  await page.getByTestId('leaving-bar').getByRole('button', { name: 'Details' }).click();
  await expect(page.getByTestId('outbound-list').locator('li[data-channel="ai-cloud"]:not([data-status="blocked"])')).toHaveCount(0);
});
