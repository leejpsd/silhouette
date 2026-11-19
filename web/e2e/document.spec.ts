import { expect, test } from '@playwright/test';
import { makeTextPdf } from '../scripts/text-pdf.mjs';
import { completeQuickCheck, confirmAllValues, verdictOf } from './helpers';
import { readFileSync } from 'node:fs';
import { AI_HOST, fakeCloudModel, fakeOnDeviceModel, fixturePointers, noOnDeviceModel, placeholderFor, recordRequests, sharedText } from './model-fakes';

test.describe('Document silhouette and pointer extraction', () => {
  test('sample paystub (PDF through pdf.js) → silhouette → cloud pointers → confirm → exact income resolves maybe', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await page.goto('/');
    await completeQuickCheck(page, { numChildren: '1', income: { band: '$30,000 to $44,999' } });
    await expect(verdictOf(page, 'work-credit')).toHaveAttribute('data-verdict', 'maybe');

    // On wide screens the rail also links to this step; the screen's own action is the last link.
    await page.getByRole('link', { name: 'Add a paystub' }).last().click();
    await expect(page.getByTestId('model-status')).toHaveAttribute('data-status', 'unavailable');
    await expect(page.getByTestId('photo-option')).toContainText("this device can't do that yet");
    await page.getByTestId('more-samples').locator('summary').click();
    await page.getByRole('button', { name: 'English paystub (PDF)' }).click();

    // Preview: the skeleton, before anything is sent.
    const preview = page.getByTestId('skeleton-preview');
    await expect(preview).toContainText('Gross Pay');
    await expect(preview).not.toContainText('1,271.88');
    await expect(preview).not.toContainText('NORTHWIND');
    await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');
    expect(cloud.bodies).toHaveLength(0);
    await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();

    // Review: provenance badge and reason chip, value next to its highlighted source.
    await expect(page.getByRole('heading', { level: 1, name: 'Check what was found' })).toBeVisible();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'IN_CLOUD');
    await expect(page.getByTestId('inference-badge')).toContainText('Cloud');
    await expect(page.getByTestId('inference-badge')).toContainText('document silhouette only');
    // The pointer, with this reading's own answer: the model's placeholder id, then the value put back.
    const pointer = page.getByTestId('pointer-reveal');
    await expect(pointer).toHaveAttribute('data-source', 'IN_CLOUD');
    await expect(pointer.getByTestId('pointer-answer')).toHaveText(/"grossPay": "N\d+"/);
    await expect(pointer.getByTestId('pointer-value')).toHaveText('1,271.88');
    await expect(pointer).toContainText('The model in the cloud saw only N');
    // The request that left carried the id, never the value.
    const id = (await pointer.locator('.pointer-ref').innerText()).trim();
    expect(cloud.bodies[0]).toContain(id);
    expect(cloud.bodies[0]).not.toContain('1,271.88');
    const gross = page.getByTestId('field-grossPay');
    await expect(gross.getByTestId('value-grossPay')).toHaveText('1,271.88');
    // Where the value was found shows when the row is opened.
    await gross.locator('.field-toggle').click();
    await expect(gross.locator('mark')).toHaveText('1,271.88');
    await expect(page.getByTestId('field-hoursWorked')).toContainText('62.00');

    // What left the device is exactly the silhouette, and the bar says so.
    expect(cloud.bodies).toHaveLength(1);
    expect(cloud.bodies[0]).toContain('Document type: paystub');
    expect(cloud.bodies[0]).not.toContain('1,271.88');
    await page.getByTestId('leaving-bar').getByRole('button', { name: 'Details' }).click();
    await expectOnlyModelAndSettings(page, 1);
    await page.getByText('Show exactly what was sent').click();
    await expect(page.getByTestId('outbound-payload')).toContainText('Gross Pay');
    await expect(page.getByTestId('outbound-payload')).not.toContainText('1,271.88');
    await page.getByTestId('leaving-bar').getByRole('button', { name: 'Hide details' }).click();

    // Confirm one field by itself, then the rest, then check.
    await gross.getByRole('button', { name: 'Confirm: Gross pay this period' }).click();
    await expect(gross).toHaveAttribute('data-status', 'confirmed');
    await confirmAllValues(page);
    await page.getByRole('button', { name: 'Check these values' }).click();
    await expect(page.getByTestId('validation').locator('[data-check="net-sum"]')).toHaveAttribute('data-status', 'ok');
    await expect(page.getByTestId('validation').locator('[data-check="rate-hours"]')).toHaveAttribute('data-status', 'ok');
    await expect(page.getByTestId('annual-income')).toHaveAttribute('data-amount', '29233');
    await page.getByRole('button', { name: 'Use $29,233 as my yearly income' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Your results' })).toBeVisible();
    await expect(verdictOf(page, 'work-credit')).toHaveAttribute('data-verdict', 'likely');
    await expect(verdictOf(page, 'work-credit')).toContainText('About $2,923 a year');
  });

  test('canary: no canary string appears in any outgoing request URL, header or body', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const canary = JSON.parse(sharedText('fixtures/canary/paystub-canary-01.json')) as { document: string; canaries: string[] };
    const requests = recordRequests(page);
    const id = (text: string) => placeholderFor('paystub-canary-01', text);
    await fakeCloudModel(page, {
      pointers: {
        employerName: [id('QUILLFEATHER')],
        employeeName: [id('Zyxwanda'), id('Quillfeather')],
        grossPay: id('1,487.50'),
        ytdGross: id('26,775.00'),
        netPay: id('1,416.37'),
        payFrequency: 'semimonthly',
        periodStart: id('09/16/2026'),
        periodEnd: id('09/30/2026'),
        payDate: id('10/05/2026'),
        deductions: [{ amount: id('71.13'), kind: 'federal_tax' }],
      },
    });
    await page.goto('/#/doc');
    await page.getByRole('heading', { level: 2, name: 'Choose a text PDF' }).waitFor();
    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({
      name: 'canary.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(makeTextPdf(sharedText(`fixtures/canary/${canary.document}`))),
    });
    await expect(page.getByTestId('skeleton-preview')).toContainText('Earnings Statement');
    await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
    await expect(page.getByTestId('inference-badge')).toBeVisible();
    // The canary document's own values are on screen (on device), which proves the flow processed it.
    await expect(page.getByTestId('value-grossPay')).toHaveText('1,487.50');
    await confirmAllValues(page);
    await page.getByRole('button', { name: 'Check these values' }).click();
    await page.getByRole('button', { name: /^Use .* as my yearly income$/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Your results' })).toBeVisible();

    expect(requests.some((r) => new URL(r.url()).hostname === AI_HOST), 'the cloud path really ran').toBe(true);
    for (const r of requests) {
      const haystack = [r.url(), JSON.stringify(await r.allHeaders()), r.postData() ?? ''].join('\n');
      for (const value of canary.canaries) expect(haystack.includes(value), `${value} leaked in ${r.method()} ${r.url()}`).toBe(false);
    }
  });

  test('on-device path (fake Chrome LanguageModel): pointers come from the device and nothing is sent', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'available', replies: { 'Document type: paystub': JSON.stringify(fixturePointers('paystub-en-01-correct')) } });
    const requests = recordRequests(page);
    await page.goto('/#/doc');
    await expect(page.getByTestId('model-status')).toHaveAttribute('data-status', 'available');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await page.getByTestId('preview-more').locator('summary').click();
    await expect(page.getByText('Your device reads this silhouette first.')).toBeVisible();
    // With the model on this device the action says where the reading starts: it is not a "Send".
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Read on this device' }).click();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'ON_DEVICE');
    await expect(page.getByTestId('inference-badge')).toContainText('On this device');
    await expect(page.getByTestId('value-grossPay')).toHaveText('1,271.88');
    await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');
    expect(requests.filter((r) => new URL(r.url()).origin !== new URL(page.url()).origin)).toEqual([]);
  });

  test('on-device in two parts: a right core is used even when the deductions and names are not read', async ({ page, context }) => {
    const { deductions, ...core } = fixturePointers('paystub-en-01-correct');
    void deductions;
    await fakeOnDeviceModel(context, {
      availability: 'available',
      // The employee name runs into the employer's last word: both names are left out as not read.
      systemReplies: { 'answer only the fields in the schema': JSON.stringify({ ...core, employeeName: ['W4', 'W5', 'W3'] }), 'answer only the deductions': JSON.stringify({ deductions: [] }) },
      replies: {},
    });
    const requests = recordRequests(page);
    await page.goto('/#/doc');
    await expect(page.getByTestId('model-status')).toHaveAttribute('data-status', 'available');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'ON_DEVICE');
    await expect(page.getByTestId('value-grossPay')).toHaveText('1,271.88');
    // Every value is in view from the start (no need to open "More values").
    await expect(page.getByTestId('deductions-not-read')).toContainText('Deductions were not read on this device.');
    await expect(page.getByTestId('not-read-employeeName')).toContainText('Not read on this device.');
    await expect(page.getByTestId('not-read-employerName')).toContainText('Not read on this device.');
    await confirmAllValues(page);
    await page.getByRole('button', { name: 'Check these values' }).click();
    await expect(page.getByTestId('annual-income')).toBeVisible();
    // Net pay against deductions that were never read is not checked, so it is not shown as a problem.
    await expect(page.locator('[data-check="net-sum"]')).toHaveCount(0);
    expect(requests.filter((r) => new URL(r.url()).origin !== new URL(page.url()).origin)).toEqual([]);
  });

  test('on-device in two parts: a core that fails its check is sent once, as the silhouette, after Send', async ({ page, context }) => {
    const correct = fixturePointers('paystub-en-01-correct');
    // Year to date below the period's gross: a failed core.
    await fakeOnDeviceModel(context, {
      availability: 'available',
      systemReplies: { 'answer only the fields in the schema': JSON.stringify({ ...correct, ytdGross: correct['netPay'] }) },
      replies: {},
    });
    const cloud = await fakeCloudModel(page, { pointers: correct });
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'IN_CLOUD');
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-reason', 'on-device-failed');
    expect(cloud.bodies).toHaveLength(1);
    expect(cloud.bodies[0]).not.toContain('1,271.88');
    // The core, then gross pay and year to date asked again (the only problem was with them); no deductions part.
    const prompts = await page.evaluate(() => (window as unknown as { __fakePrompts: string[] }).__fakePrompts);
    expect(prompts.filter((p) => p.includes('Document type: paystub'))).toHaveLength(2);
    const constraints = await page.evaluate(() => (window as unknown as { __fakeConstraints: string[] }).__fakeConstraints);
    expect(constraints.some((c) => c.includes('"deductions"'))).toBe(false);
    expect(constraints.some((c) => c.includes('"required":["grossPay","ytdGross"]'))).toBe(true);
  });

  test('period dates left empty on the device: the yearly income uses the pay date, and the review says so', async ({ page, context }) => {
    const { deductions, periodStart, periodEnd, ...core } = fixturePointers('paystub-en-01-correct');
    void periodStart;
    void periodEnd;
    await fakeOnDeviceModel(context, {
      availability: 'available',
      systemReplies: { 'answer only the fields in the schema': JSON.stringify({ ...core, periodStart: null, periodEnd: null }), 'answer only the deductions': JSON.stringify({ deductions }) },
      replies: {},
    });
    await page.goto('/#/doc');
    await expect(page.getByTestId('model-status')).toHaveAttribute('data-status', 'available');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'ON_DEVICE');
    await confirmAllValues(page);
    await page.getByRole('button', { name: 'Check these values' }).click();
    await expect(page.getByTestId('annual-income')).toBeVisible();
    await expect(page.locator('.basis')).toContainText('through Oct 20, 2026');
    await expect(page.getByTestId('basis-date')).toHaveAttribute('data-source', 'payDate');
    await expect(page.getByTestId('basis-date')).toHaveText('The date is the pay date: no end of the pay period was found.');
    // Without a period end, the pay date is the date shown with the leading values.
    await expect(page.getByTestId('lead-fields').getByTestId('field-payDate')).toBeVisible();
  });

  test('read ahead: the whole reading runs while the preview is open; Send asks the device for nothing more; a hidden word starts it again', async ({ page, context }) => {
    const { deductions, ...core } = fixturePointers('paystub-en-01-correct');
    await fakeOnDeviceModel(context, {
      availability: 'available',
      systemReplies: { 'answer only the fields in the schema': JSON.stringify(core), 'answer only the deductions': JSON.stringify({ deductions }) },
      replies: {},
    });
    const requests = recordRequests(page);
    const prompts = () => page.evaluate(() => (window as unknown as { __fakePrompts: string[] }).__fakePrompts.length);
    await page.goto('/#/doc');
    await expect(page.getByTestId('model-status')).toHaveAttribute('data-status', 'available');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    // Both parts are read before Send.
    await expect.poll(prompts, { timeout: 10_000 }).toBe(2);
    // A word hidden: the changed silhouette is read again from the start.
    await page.getByRole('button', { name: 'Hide “Earnings”' }).first().click();
    await expect.poll(prompts, { timeout: 10_000 }).toBe(4);
    await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'ON_DEVICE');
    await expect(page.getByTestId('value-grossPay')).toHaveText('1,271.88');
    expect(await prompts()).toBe(4);
    expect(requests.filter((r) => new URL(r.url()).origin !== new URL(page.url()).origin)).toEqual([]);
  });

  test('on the device, values no check confirms are not shown: hours and rate that do not multiply to an earnings amount', async ({ page, context }) => {
    const { deductions, ...core } = fixturePointers('paystub-en-01-correct');
    await fakeOnDeviceModel(context, {
      availability: 'available',
      systemReplies: { 'answer only the fields in the schema': JSON.stringify({ ...core, hoursWorked: 'N1', hourlyRate: 'N2' }), 'answer only the deductions': JSON.stringify({ deductions }) },
      replies: {},
    });
    await page.goto('/#/doc');
    await expect(page.getByTestId('model-status')).toHaveAttribute('data-status', 'available');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'ON_DEVICE');
    // Every value is in view from the start (no need to open "More values").
    await expect(page.getByTestId('not-read-hoursWorked')).toContainText('Not read on this device.');
    await expect(page.getByTestId('not-read-hourlyRate')).toContainText('Not read on this device.');
    await expect(page.getByTestId('value-netPay')).toHaveText('1,100.92');
  });

  test('photo path (fake on-device model): ONLY_ON_DEVICE transcription, then the same silhouette', async ({ page, context }) => {
    await fakeOnDeviceModel(context, {
      availability: 'available',
      replies: { 'Transcribe this paystub photo': sharedText('samples/paystub-en-01.txt'), 'Document type: paystub': '{"grossPay":"N12"}' },
    });
    const requests = recordRequests(page);
    await page.goto('/#/doc');
    await expect(page.getByTestId('photo-option')).toHaveAttribute('data-status', 'available');
    const png = readFileSync(new URL('../public/icon-192.png', import.meta.url)); // any real PNG
    await page.locator('input[type="file"][accept*="image"]').setInputFiles({ name: 'stub.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-reason', 'photo-never-leaves');
    await expect(page.getByTestId('skeleton-preview')).toContainText('Gross Pay');
    await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
    await expect(page.getByTestId('value-grossPay')).toHaveText('1,271.88');
    expect(requests.filter((r) => new URL(r.url()).origin !== new URL(page.url()).origin)).toEqual([]);
  });

  test('model status: downloadable → download after a click, with progress → available', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'downloadable', replies: {} });
    await page.goto('/#/doc');
    const status = page.getByTestId('model-status');
    await expect(status).toHaveAttribute('data-status', 'downloadable');
    await status.getByRole('button', { name: 'Download the on-device model' }).click();
    await expect(status).toHaveAttribute('data-status', 'available');
  });

  test('the model download does not depend on a task prompt fitting the device model', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'downloadable', replies: {}, initialPromptTooLarge: true });
    await page.goto('/#/doc');
    const status = page.getByTestId('model-status');
    await status.getByRole('button', { name: 'Download the on-device model' }).click();
    await expect(status).toHaveAttribute('data-status', 'available');
    await expect(status.getByRole('alert')).toHaveCount(0);
  });

  test('an App Check rejection is shown honestly and the user can type the numbers instead', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeCloudModel(page, {
      status: 401,
      body: { error: { code: 401, message: 'Firebase App Check token is invalid.', status: 'UNAUTHENTICATED' } },
    });
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
    await expect(page.getByTestId('task-error')).toHaveAttribute('data-kind', 'app-check');
    // A browser driven by a test tool: the notice names the cause (treated as a bot), says nothing was sent and what to do.
    await expect(page.getByTestId('task-error')).toContainText('treated this browser as a bot, because automation software is controlling it');
    await expect(page.getByTestId('task-error')).toContainText('The silhouette was not sent.');
    await expect(page.getByTestId('task-error')).toContainText('Try again, or type the numbers instead.');
    await page.getByRole('button', { name: 'Type the numbers instead' }).click();
    // Typing the numbers: nothing was looked for, so nothing is "not found".
    await expect(page.getByTestId('value-grossPay')).toHaveText('Not typed yet');
    // No model answered: no pointer to show.
    await expect(page.getByTestId('pointer-reveal')).toHaveCount(0);
  });

  test('manual entry with no model at all', async ({ page }) => {
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'Type the numbers yourself' }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Type the numbers yourself');
    // Nothing typed yet: the action answers the press with what it needs.
    await page.getByRole('button', { name: 'Check these values' }).click();
    await expect(page.getByRole('alert')).toContainText('Type at least your gross pay');
    // A row opens straight into its field, with focus.
    await page.getByTestId('field-grossPay').locator('.field-toggle').click();
    await expect(page.getByTestId('field-grossPay').getByRole('textbox')).toBeFocused();
    await page.getByTestId('field-grossPay').getByRole('textbox').fill('2,500.00');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByTestId('field-payFrequency').locator('.field-toggle').click();
    await page.getByTestId('field-payFrequency').getByRole('combobox').selectOption('biweekly');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Check these values' }).click();
    await expect(page.getByTestId('annual-income')).toHaveAttribute('data-amount', '65000');
  });
});

/**
 * The record lists `models` model requests. After the first one, the app fetches its settings
 * (Remote Config, with an installation id); those are the only other entries allowed.
 */
async function expectOnlyModelAndSettings(page: import('@playwright/test').Page, models: number) {
  const list = page.getByTestId('outbound-list');
  await expect(list.locator('li[data-channel="ai-cloud"]')).toHaveCount(models);
  const channels = await list.locator('li').evaluateAll((items) => items.map((li) => li.getAttribute('data-channel')));
  expect(channels.filter((c) => c !== 'ai-cloud' && c !== 'remote-config')).toEqual([]);
}

test('the folded values are counted as the button above counts them, with fields not found named apart', async ({ page, context }) => {
  await noOnDeviceModel(context);
  // A reading that found everything but the hours and the rate.
  const pointers = { ...fixturePointers('paystub-en-01-correct'), hoursWorked: null, hourlyRate: null } as Record<string, unknown>;
  await fakeCloudModel(page, { pointers });
  await page.goto('/#/doc');
  await page.getByRole('button', { name: 'English paystub (text)' }).click();
  await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
  // The other values are counted on their fold, with the fields not found named apart; opened, the button
  // counts every value found.
  const more = page.getByTestId('more-values');
  const m = (await more.innerText()).match(/\((\d+) found · (\d+) not found\)/);
  expect(m).not.toBeNull();
  expect(Number(m?.[2])).toBe(2);
  const shown = await page.getByTestId('lead-fields').locator(':scope > li').count();
  await more.click();
  const confirmAll = page.getByRole('button', { name: /^Confirm all \d+ values$/ });
  const total = Number((await confirmAll.innerText()).match(/\d+/)?.[0]);
  expect(shown + Number(m?.[1])).toBe(total);
});
