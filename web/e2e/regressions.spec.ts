// Regression tests for problems found by testing the app in a real browser.
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_ANSWERS, answerCurrent, completeQuickCheck, verdictOf } from './helpers';
import { chooseLanguage, openDeleteEverything } from './helpers';
import { AI_HOST, fakeCloudModel, fakeOnDeviceModel, fixturePointers, noOnDeviceModel } from './model-fakes';

async function sendSample(page: Page) {
  await page.goto('/#/doc');
  await page.getByRole('button', { name: 'English paystub (text)' }).click();
  await page.getByTestId('skeleton-preview').waitFor();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByTestId('inference-badge').waitFor();
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('regressions', () => {
  test('a bundled sample with no network and no device model is filled from its answer key, labelled, and nothing is sent', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeCloudModel(page, { pointers: {} });
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await page.getByTestId('skeleton-preview').waitFor();
    // Load the review screen's code while online, then come back to the preview.
    await page.goto('/#/doc/review');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.goBack();
    await page.getByTestId('skeleton-preview').waitFor();
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Fill in the sample answers' }).click();
    const badge = page.getByTestId('inference-badge');
    await expect(badge).toHaveAttribute('data-source', 'SAMPLE_KEY');
    await expect(badge).toHaveAttribute('data-reason', 'sample-answer-key');
    await expect(badge).toContainText('Sample answers, no AI');
    await expect(page.getByTestId('value-grossPay')).toHaveText('1,271.88');
    expect(cloud.bodies).toHaveLength(0);
    await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');
    await context.setOffline(false);
  });

  test('the preview opens on what could leave; the bars wipe in once, then only new bars animate, and focus stays on the next word', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    const preview = page.getByTestId('skeleton-preview');
    // Never real values first: the screen opens on the silhouette, its heading.
    await expect(preview).toHaveAttribute('data-mode', 'leave');
    const total = await preview.locator('.tok').count();
    await expect(preview.locator('.tok-new')).toHaveCount(total);
    // Switching views does not replay the bars.
    await page.getByRole('button', { name: 'On this phone' }).click();
    await page.getByRole('button', { name: 'What could leave' }).click();
    await expect(preview.locator('.tok-new')).toHaveCount(0);
    // Hiding a word animates only the new bar, and focus moves to the next word.
    const word = preview.getByRole('button', { name: 'Hide “Federal”' }).first();
    await word.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('hidden-words')).toBeVisible();
    const fresh = await preview.locator('.tok-new').count();
    expect(fresh).toBeGreaterThan(0);
    expect(fresh).toBeLessThan(5);
    await expect(preview.locator('button.word:focus')).toHaveCount(1);
    // Reduced motion: nothing animates.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await expect(preview).toHaveAttribute('data-mode', 'leave');
    await expect(preview.locator('.tok-new')).toHaveCount(0);
  });

  test('a long document: no turned paper, nothing off the screen, no sideways scroll', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/doc');
    const line = 'Regular Hours 40.00 18.50 740.00 Overtime 4.00 27.75 111.00 Gross Pay 851.00 Northwind Staffing LLC\n';
    await page.locator('textarea').first().fill(line.repeat(120));
    await page.getByRole('button', { name: 'Continue with this text' }).click();
    const preview = page.getByTestId('skeleton-preview');
    await expect(preview).toHaveAttribute('data-tall', 'true');
    expect(await preview.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    const first = await preview.locator('.tok').first().boundingBox();
    expect(first!.x).toBeGreaterThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('a dot followed by three digits is refused with the accepted form, in English and Spanish', async ({ page }) => {
    await page.goto('/#/q/income');
    await page.getByLabel('I know the exact amount').check();
    const field = page.getByLabel('Yearly household income');
    for (const typed of ['60.000', '1.271']) {
      await field.fill(typed);
      await expect(page.getByTestId('amount-understood')).toHaveText('');
      await page.getByRole('button', { name: /^(Next|See results)$/ }).click();
      await expect(page.getByRole('alert')).toHaveText('Use a comma for thousands and a dot for cents, like 60,000 or 60,000.50.');
    }
    await chooseLanguage(page, 'es');
    await page.getByLabel('Sé la cantidad exacta').check();
    await page.getByLabel('Ingreso anual del hogar').fill('60.000');
    await page.getByRole('button', { name: /^(Siguiente|Ver resultados)$/ }).click();
    await expect(page.getByRole('alert')).toContainText('Usa coma para los miles y punto para los centavos');
    await page.getByLabel('Ingreso anual del hogar').fill('60,000');
    await expect(page.getByTestId('amount-understood')).not.toHaveText('');
  });

  test('a document sent when the daily limit is reached says so, and offers typing instead of "try again"', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeCloudModel(page, { status: 429, body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for metric: generativelanguage.googleapis.com/generate_requests_per_model_per_day, limit: 500' } } });
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const notice = page.getByTestId('task-error');
    await expect(notice).toHaveAttribute('data-kind', 'quota-daily');
    await expect(notice).toContainText("free daily limit has been reached");
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Type the numbers instead' })).toBeVisible();
  });

  test('on the review screen a typed "1.271" is refused, while document values with more decimals stay', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await sendSample(page);
    const gross = page.getByTestId('field-grossPay');
    await page.getByTestId('field-grossPay').locator('.field-toggle').click();

    await gross.getByRole('button', { name: 'Change: Gross pay this period' }).click();
    await gross.getByRole('textbox').fill('1.271');
    await gross.getByRole('button', { name: 'Save' }).click();
    await expect(gross.getByTestId('review-number-error')).toHaveText('Use a comma for thousands and a dot for cents, like 60,000 or 60,000.50.');
    await gross.getByRole('textbox').fill('1,271.88');
    await gross.getByRole('button', { name: 'Save' }).click();
    await expect(gross).toHaveAttribute('data-status', 'confirmed');
  });

  test('an exact income with decimals is read as typed, and the understood amount is shown', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Start Quick Check' }).click();
    for (let i = 0; i < 3; i++) await answerCurrent(page, DEFAULT_ANSWERS);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/earn in a year/);
    await page.getByLabel('I know the exact amount').check();
    const field = page.getByLabel('Yearly household income');
    await field.fill('28.000,50');
    await expect(page.getByTestId('amount-understood')).toHaveText('');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('alert')).toContainText('32,000.50');
    await field.fill('28000.50');
    await expect(page.getByTestId('amount-understood')).toHaveText('Understood as $28,000.50 a year.');
    await field.fill('$28,000.5');
    await expect(page.getByTestId('amount-understood')).toHaveText('Understood as $28,000.50 a year.');
    await page.getByRole('button', { name: 'Next' }).click();
    for (let i = 0; i < 4; i++) await answerCurrent(page, DEFAULT_ANSWERS);
    // work-credit amount = min(3000, 0.1 × 28,000.50) = 2,800.05 → 2,800 (not 280,005 or 2,800,050)
    await expect(verdictOf(page, 'work-credit')).toContainText('About $2,800 a year');
  });

  test('the ledger survives a reload, shows status and the whole request, and says when it was deleted', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await sendSample(page);
    await page.reload();
    const bar = page.getByTestId('leaving-bar');
    await bar.getByRole('button', { name: 'Details' }).click();
    await expect(bar).not.toContainText('No answers, results or documents have been sent anywhere');
    await expect(bar).toContainText('Only the requests listed below have left it');
    // The model request, then possibly the settings fetch that follows it (Remote Config).
    const model = bar.locator('li[data-channel="ai-cloud"]');
    await expect(model).toHaveCount(1);
    const others = await bar.locator('li:not([data-channel="ai-cloud"])').evaluateAll((items) => items.map((li) => li.getAttribute('data-channel')));
    expect(others.filter((c) => c !== 'remote-config')).toEqual([]);
    await expect(model.getByTestId('outbound-status')).toHaveText('Sent, response 200');
    await expect(bar).toContainText(`Request to ${AI_HOST}/v1beta/projects/silhouette-hybrid/models/gemini-3.5-flash-lite:generateContent`);
    await expect(bar).toContainText('Model: gemini-3.5-flash-lite');
    await model.getByText('Show exactly what was sent').click();
    const body = (await model.getByTestId('outbound-payload').textContent()) ?? '';
    for (const part of ['"systemInstruction"', '"generationConfig"', '"responseSchema"', '"required"', 'Document type: paystub']) expect(body).toContain(part);
    expect(body).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/); // API key
    // Exactly the body that was sent: keys that merely contain "token" stay, credentials are never in it.
    expect(body).toContain('"maxOutputTokens":1024');
    expect(body).not.toMatch(/appCheck|x-goog|Authorization/i);

    // "Delete everything" sits below the record.
    await (await openDeleteEverything(page)).getByRole('button', { name: 'Delete everything' }).click();
    await expect(bar).toHaveAttribute('data-outbound-count', '0');
    await expect(bar).toHaveAttribute('data-cleared', 'true');
    await expect(bar).toContainText('Record deleted on');
    await expect(bar).not.toContainText('Nothing has left this device.');
    await page.reload();
    await expect(page.getByTestId('leaving-bar')).toContainText('Record deleted on');
  });

  test('"Delete everything" also removes the Firebase SDK databases', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await sendSample(page);
    const before = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).sort());
    expect(before.some((n) => n?.startsWith('firebase'))).toBe(true);
    await (await openDeleteEverything(page, 'demo')).getByRole('button', { name: 'Delete everything' }).click();
    await expect(page.getByText(/Erased: answers, documents in progress/)).toBeVisible();
    await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).toEqual([]);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('firebase')))).toEqual([]);
  });

  test('an on-device failure is retried once in the cloud with the silhouette, and the chip says so', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'available', replies: {}, throwMessage: 'The input is too large.' });
    const cloud = await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await sendSample(page);
    expect(cloud.bodies).toHaveLength(1);
    expect(cloud.bodies[0]).not.toContain('1,271.88');
    const badge = page.getByTestId('inference-badge');
    await expect(badge).toHaveAttribute('data-source', 'IN_CLOUD');
    await expect(badge).toHaveAttribute('data-reason', 'on-device-failed');
    await expect(badge).toContainText('on-device attempt failed');
    await expect(page.getByTestId('value-grossPay')).toHaveText('1,271.88');
  });

  test('a visible word can be hidden before sending (keyboard), with undo; the hidden word is not sent', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeCloudModel(page, { pointers: {} });
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    const preview = page.getByTestId('skeleton-preview');
    await expect(preview).toContainText('Net Pay');
    const hideNet = page.getByRole('button', { name: 'Hide “Net”' });
    await hideNet.focus();
    await page.keyboard.press('Enter');
    await expect(preview).not.toContainText('Net Pay');
    const undo = page.getByRole('button', { name: 'Show “net” again' });
    await expect(undo).toBeVisible();
    await undo.focus();
    await page.keyboard.press('Enter');
    await expect(preview).toContainText('Net Pay');
    await page.getByRole('button', { name: 'Hide “Net”' }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByTestId('inference-badge').waitFor();
    expect(cloud.bodies[0]).not.toContain('Net Pay');
  });

  test('a label in front of a masked name stays visible, and hiding it masks the label too', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeCloudModel(page, { pointers: {} });
    await page.goto('/#/doc');
    await page.getByLabel('Paystub text').fill('Employee Lucia Lindqvist   ID 004417\nGross Pay 1,200.00\nNet Pay 950.00');
    await page.getByRole('button', { name: 'Continue with this text' }).click();
    const preview = page.getByTestId('skeleton-preview');
    await expect(preview).toContainText('Employee W1 W2');
    await expect(preview).not.toContainText('Lucia');
    await page.getByRole('button', { name: 'Hide “Employee”' }).click();
    await expect(preview).toContainText('W1 W2 W3');
    await expect(preview).not.toContainText('Employee');
    await expect(preview).toContainText('Gross Pay');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByTestId('inference-badge').waitFor();
    expect(cloud.bodies[0]).not.toContain('Employee');
    expect(cloud.bodies[0]).not.toContain('Lindqvist');
  });

  test('a document that is not a paystub gets a plain message and a way forward', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeCloudModel(page, { pointers: {} });
    await sendSample(page).catch(() => undefined);
    await expect(page.getByTestId('not-a-document')).toBeVisible();
    await expect(page.getByText('Not found')).toHaveCount(0);
    await page.getByRole('button', { name: 'Type the numbers yourself' }).click();
    await expect(page.getByTestId('value-grossPay')).toHaveText('Not found');
  });

  test('narrow phones: the document screens never scroll sideways', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    for (const width of [320, 360, 375]) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto('/#/doc');
      await page.getByTestId('model-status').waitFor();
      expect(await noOverflow(page), `add ${width}`).toBe(true);
      await page.getByRole('button', { name: 'English paystub (text)' }).click();
      await page.getByTestId('skeleton-preview').waitFor();
      expect(await noOverflow(page), `preview ${width}`).toBe(true);
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.getByTestId('inference-badge').waitFor();
      expect(await noOverflow(page), `review ${width}`).toBe(true);
    }
  });

  test('the last control on a page is not hidden under the sticky bar when focused', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/');
    await completeQuickCheck(page);
    const last = page.locator('main').locator('a[href], button:not([disabled])').last();
    await last.focus();
    const [box, bar] = await Promise.all([last.boundingBox(), page.getByTestId('bottom-block').boundingBox()]);
    expect(box!.y + box!.height).toBeLessThanOrEqual(bar!.y);
  });

  test('the demo notice is one line with "More" for the rules, and the start button says what it does', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByTestId('demo-banner');
    await expect(banner).toContainText('Demo rules: not real programs.');
    expect((await banner.boundingBox())!.height).toBeLessThan(60);
    await banner.getByRole('button', { name: 'More' }).click();
    const sheet = page.getByRole('dialog', { name: 'Demo rules — not real programs' });
    await expect(sheet).toContainText('invented for testing');
    await sheet.getByRole('button', { name: 'Close' }).first().click();
    await expect(sheet).toBeHidden();
    await page.getByRole('button', { name: 'Start Quick Check' }).click();
    expect((await banner.boundingBox())!.height).toBeLessThan(60);
    await answerCurrent(page, DEFAULT_ANSWERS);
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Continue Quick Check' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/How many children/);
    await page.goto('/#/');
    await page.goto('/');
    await page.getByRole('button', { name: 'Start over' }).click();
    for (let i = 0; i < 8; i++) await answerCurrent(page, DEFAULT_ANSWERS);
    await page.goto('/#/');
    await page.getByRole('button', { name: 'See my results' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Your results' })).toBeVisible();
  });
});
