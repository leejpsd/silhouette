// Form W-2 (contract v1.34): recognised by its title, read like a paystub (one request on the device),
// box 1 used as it is, and the forms of one year from different employers added together.
import { expect, test, type Page } from '@playwright/test';
import { completeQuickCheck, confirmAllValues } from './helpers';
import { AI_HOST, fakeCloudModel, fakeOnDeviceModel, fixturePointers, noOnDeviceModel, recordRequests, sharedText } from './model-fakes';

const W2_TEXT = sharedText('samples/w2-en-01.txt');
/** Values of the W-2 sample that must never leave the device. */
const W2_VALUES = ['27,640.18', '28,880.18', '000-12-3456', '00-1234567', 'NORTHWIND', 'Maria', 'Lopez', 'Juniper'];
/** A second employer's W-2 for the same year: the same form, other wages (the same placeholders). */
const SECOND_W2 = W2_TEXT.replaceAll('NORTHWIND STAFFING LLC', 'BLUEBIRD CATERING INC').replaceAll('27,640.18', '4,210.75').replaceAll('28,880.18', '4,210.75');

async function pasteText(page: Page, text: string) {
  await page.locator('.source-paste .source-row-button').click();
  await page.locator('.paste-box textarea').fill(text);
  await page.getByRole('button', { name: 'Continue with this text' }).click();
}

async function readAndCheck(page: Page) {
  await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check what was found' })).toBeVisible();
  await confirmAllValues(page);
  await page.getByRole('button', { name: 'Check these values' }).click();
}

test.describe('Form W-2', () => {
  test('the W-2 sample through the cloud: box 1 as the yearly income, with its tax year on the results', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeCloudModel(page, { pointers: fixturePointers('w2-en-01-correct') });
    const requests = recordRequests(page);
    await page.goto('/');
    await completeQuickCheck(page, { numChildren: '1', income: { band: '$30,000 to $44,999' } });
    await page.getByRole('link', { name: 'Add a paystub or W-2' }).last().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Add a paystub or W-2' })).toBeVisible();
    await page.getByTestId('more-samples').locator('summary').click();
    await page.getByRole('button', { name: 'W-2 for 2025 (text)' }).click();

    // The silhouette: read as a W-2; the recorded paystub reading is not offered for it.
    await expect(page.getByTestId('detected-w2')).toContainText('This looks like a Form W-2: it is read as one.');
    const preview = page.getByTestId('skeleton-preview');
    await expect(preview).toContainText('Wages, tips, other compensation');
    for (const value of W2_VALUES) await expect(preview).not.toContainText(value);
    await expect(page.getByTestId('use-recorded')).toHaveCount(0);
    await expect(page.getByTestId('see-recorded')).toHaveCount(0);
    expect(cloud.bodies).toHaveLength(0);

    await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Check what was found' })).toBeVisible();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'IN_CLOUD');
    // The pointer card shows box 1: the model's id, then the value this device put back.
    const pointer = page.getByTestId('pointer-reveal');
    await expect(pointer.getByTestId('pointer-answer')).toHaveText('"wages": "N9"');
    await expect(pointer.getByTestId('pointer-value')).toHaveText('27,640.18');
    await expect(pointer).toContainText('from your W-2');
    // What decides the result first: box 1 and the tax year; the rest below them, in view.
    await expect(page.getByTestId('lead-fields').locator('.field-label')).toHaveText(['Wages, tips, other compensation (box 1)', 'Tax year']);
    await expect(page.getByTestId('value-taxYear')).toHaveText('2025');
    await expect(page.getByTestId('field-medicareWages')).toBeVisible();

    // The request carried the silhouette and the document type, never a value of the W-2.
    expect(cloud.bodies).toHaveLength(1);
    expect(cloud.bodies[0]).toContain('Document type: w2');
    for (const r of requests.filter((x) => new URL(x.url()).hostname === AI_HOST)) {
      for (const value of W2_VALUES) expect(r.postData() ?? '', `${value} was sent`).not.toContain(value);
    }

    await confirmAllValues(page);
    await page.getByRole('button', { name: 'Check these values' }).click();
    const validation = page.getByTestId('validation');
    await expect(validation.locator('[data-check="w2-medicare-wages"]')).toHaveAttribute('data-status', 'ok');
    await expect(validation.locator('[data-check="w2-year"]')).toHaveAttribute('data-status', 'ok');
    await expect(page.getByTestId('annual-income')).toHaveAttribute('data-amount', '27640');
    await expect(page.getByTestId('basis')).toHaveText('Wages on the 2025 W-2 (box 1) = $27,640');
    await page.getByRole('button', { name: 'Use $27,640 as my yearly income' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Your results' })).toBeVisible();
    const source = page.getByTestId('results-source');
    await expect(source).toContainText('Rules + W-2');
    await expect(page.getByTestId('income-from')).toHaveText('Yearly income read from the W-2: by Firebase AI Logic in the cloud, from the silhouette only.');
    await expect(page.getByTestId('income-basis')).toHaveAttribute('data-method', 'w2');
    await expect(page.getByTestId('income-basis')).toContainText('$27,640 a year: the wages on your 2025 W-2 (box 1), as your employer reported them.');
    await expect(page.getByTestId('income-basis-note')).toContainText('These are 2025’s wages.');
    await expect(page.getByTestId('income-basis-note')).not.toContainText('projection');
    await expect(page.getByTestId('income-basis').getByRole('button', { name: 'Change the yearly income' })).toBeVisible();
  });

  test('a cloud answer that points box 1 at the ZIP code and the tax year at the form title: both left out, said why, typed by the person', async ({ page, context }) => {
    await noOnDeviceModel(context);
    // N8 is the ZIP code of the address (no cents), N1 the 2 of "W-2" (contract v1.37, DEVICE_READING.md section 9).
    await fakeCloudModel(page, { pointers: { ...fixturePointers('w2-en-01-correct'), wages: 'N8', taxYear: 'N1' } });
    await page.goto('/');
    await completeQuickCheck(page, { numChildren: '1', income: { band: '$30,000 to $44,999' } });
    await page.getByRole('link', { name: 'Add a paystub or W-2' }).last().click();
    await page.getByTestId('more-samples').locator('summary').click();
    await page.getByRole('button', { name: 'W-2 for 2025 (text)' }).click();
    await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Check what was found' })).toBeVisible();
    await expect(page.getByTestId('left-out-wages')).toHaveText('Left out: what was found here is not an amount (a box number, a street number or a ZIP code). Type it from your form.');
    await expect(page.getByTestId('left-out-taxYear')).toHaveText('Left out: what was found here is not a year. Type the tax year from your form.');
    // The ZIP code is never shown as wages.
    await expect(page.getByTestId('field-wages')).not.toContainText('90011');
    await expect(page.getByTestId('field-medicareWages')).toContainText('28,880.18');
  });

  test('a pasted W-2 is recognised by its title and read as a W-2; a pasted paystub is not', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeCloudModel(page, { pointers: fixturePointers('w2-en-01-correct') });
    await page.goto('/#/doc');
    await pasteText(page, W2_TEXT);
    await expect(page.getByTestId('detected-w2')).toBeVisible();
    await page.getByRole('button', { name: /^(Send|Read on this device)$/ }).click();
    await expect(page.getByTestId('field-wages')).toContainText('Wages, tips, other compensation (box 1)');
    expect(cloud.bodies[0]).toContain('Document type: w2');
    expect(cloud.bodies[0]).not.toContain('27,640.18');

    await page.goto('/#/doc');
    await pasteText(page, sharedText('samples/paystub-en-01.txt'));
    await expect(page.getByTestId('skeleton-preview')).toContainText('Gross Pay');
    await expect(page.getByTestId('detected-w2')).toHaveCount(0);
  });

  test('on the device (fake Prompt API): a W-2 is one request, and nothing is sent', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'available', replies: { 'Document type: w2': JSON.stringify(fixturePointers('w2-en-01-correct')) } });
    const requests = recordRequests(page);
    await page.goto('/#/doc');
    await expect(page.getByTestId('model-status')).toHaveAttribute('data-status', 'available');
    await page.getByTestId('more-samples').locator('summary').click();
    await page.getByRole('button', { name: 'W-2 for 2025 (text)' }).click();
    await expect(page.getByTestId('detected-w2')).toBeVisible();
    await page.getByRole('button', { name: 'Read on this device' }).click();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'ON_DEVICE');
    await expect(page.getByTestId('value-wages')).toHaveText('27,640.18');
    await expect(page.getByTestId('pointer-reveal')).toContainText('from your W-2');
    const prompts = await page.evaluate(() => (window as unknown as { __fakePrompts: string[] }).__fakePrompts);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('Document type: w2');
    for (const value of W2_VALUES) expect(prompts[0]).not.toContain(value);
    // One request with the whole schema: no part of a two-part reading.
    const constraints = await page.evaluate(() => (window as unknown as { __fakeConstraints: string[] }).__fakeConstraints);
    expect(constraints[0]).toContain('"wages"');
    expect(constraints[0]).toContain('"taxYear"');
    await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');
    expect(requests.filter((r) => new URL(r.url()).origin !== new URL(page.url()).origin)).toEqual([]);
  });

  test('two W-2s of the same year (two employers) are added together', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeCloudModel(page, { pointers: fixturePointers('w2-en-01-correct') });
    await page.goto('/#/doc');
    await page.getByTestId('more-samples').locator('summary').click();
    await page.getByRole('button', { name: 'W-2 for 2025 (text)' }).click();
    await readAndCheck(page);
    await expect(page.getByTestId('annual-income')).toHaveAttribute('data-amount', '27640');
    await page.getByRole('button', { name: 'Add another W-2 (another employer)' }).click();

    await pasteText(page, SECOND_W2);
    await expect(page.getByTestId('detected-w2')).toBeVisible();
    await readAndCheck(page);
    await expect(page.getByTestId('value-wages')).toHaveText('4,210.75');
    await expect(page.getByTestId('annual-income')).toHaveAttribute('data-amount', '31851');
    await expect(page.getByTestId('basis')).toHaveText('Wages on 2 W-2s for 2025 (box 1), added together = $31,851');
    expect(cloud.bodies).toHaveLength(2);
    for (const body of cloud.bodies) for (const value of ['27,640.18', '4,210.75', 'BLUEBIRD']) expect(body).not.toContain(value);
    await page.getByRole('button', { name: 'Use $31,851 as my yearly income' }).click();
    await expect(page.getByTestId('income-basis')).toContainText('$31,851 a year: the wages on your 2 W-2s for 2025 (box 1), added together.');
  });
});
