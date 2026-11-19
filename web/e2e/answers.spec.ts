import { expect, test, type Page } from '@playwright/test';
import { completeQuickCheck } from './helpers';
import { chooseLanguage } from './helpers';
import { fakeAnswerModels, fakeOnDeviceModel, noOnDeviceModel, seedRemoteConfig } from './model-fakes';

const ALL_ON = { feature_grounding_search: 'true', feature_grounding_maps: 'true', feature_tts: 'true' };

async function openProgram(page: Page, id: string) {
  await page.goto(`/#/program/${id}`);
  await expect(page.getByTestId('verdict-card')).toBeVisible();
}

const explainButton = (page: Page) => page.getByRole('button', { name: 'Explain this program' });
/** Keep and Send live in the bottom block: the screen's main decision. */
const decision = (page: Page) => page.getByTestId('send-decision');
const shortAnswer = (page: Page) => page.getByTestId('explain-short').getByTestId('answer');

test.describe('the person\'s result, and the program explained in general', () => {
  test('nothing is requested until a tap; what is shown before sending is byte for byte what is sent and recorded', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeAnswerModels(page);
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    await expect(page.getByTestId('about-lead')).toContainText('Nothing about you is sent');
    // The rule pack's own information about the program is on the page before any model is asked.
    await expect(page.getByTestId('program-copy')).toContainText('A discount on the monthly electricity or gas bill');
    await expect(page.getByTestId('program-copy-official')).toContainText('Apply with a one-page form');
    expect(cloud.bodies).toHaveLength(0);
    await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');

    await explainButton(page).click();
    const panel = page.getByTestId('send-panel');
    // A bottom sheet on a phone ("Leaving your device"), a modal on wide screens ("Before this leaves").
    await expect(panel.getByRole('heading', { name: /^(Leaving your device|Before this leaves)$/ })).toBeFocused();
    const lines = page.getByTestId('send-lines');
    await expect(lines).toContainText('Nothing about you. Only the program, its public information and the question.');
    await expect(lines).toContainText('Program: Test Utility Discount');
    await expect(lines).not.toContainText('Income range');
    await panel.getByText('Show the exact request').click();
    const shown = (await page.getByTestId('send-payload').textContent()) ?? '';
    // Nothing about the person: no exact value, no silhouette, no rule state, no result.
    expect(shown).not.toMatch(/30524|incomeBand|householdSize|renter|Met from|Not met|Checked on the device|Verdict|"model"/);
    expect(shown).toContain('Information about this program:');
    expect(cloud.bodies).toHaveLength(0);

    await decision(page).getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('heading', { name: 'About this program' })).toBeFocused();
    await expect(shortAnswer(page)).toContainText('This program lowers utility bills');
    const badge = shortAnswer(page).getByTestId('inference-badge');
    await expect(badge).toHaveAttribute('data-source', 'IN_CLOUD');
    await expect(badge).toHaveAttribute('data-reason', 'short-text');
    // Why it ran in the cloud: the preference was device-first, but there is no model on this device.
    await expect(badge).toContainText('no model on this device');
    await expect(badge.locator('.visually-hidden')).toHaveText('Written in the cloud: short text, no model on this device');

    // Shown before sending = sent = recorded, byte for byte.
    expect(cloud.bodies).toHaveLength(1);
    expect(shown).toBe(cloud.bodies[0]);
    expect(shown).toContain('"maxOutputTokens":256');
    const bar = page.getByTestId('leaving-bar');
    await bar.getByRole('button', { name: 'Details' }).click();
    const model = bar.locator('li[data-channel="ai-cloud"]');
    await model.getByText('Show exactly what was sent').click();
    expect(await model.getByTestId('outbound-payload').textContent()).toBe(cloud.bodies[0]);
    await expect(bar).toContainText('Program facts');
    await expect(bar).not.toContainText('Profile silhouette');
    await bar.getByRole('button', { name: 'Hide details' }).click();
    await expect(page.getByTestId('verdict-card')).toHaveAttribute('data-verdict', 'likely');

    // Cached for the session.
    await openProgram(page, 'food-help');
    await openProgram(page, 'utility-discount');
    await expect(shortAnswer(page)).toBeVisible();
    expect(cloud.bodies).toHaveLength(1);
  });

  test('agreeing to a device-first request that stayed on the device does not cover a cloud-first one', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'available', replies: { 'Program: Test Utility Discount': 'An explanation written on this device.' } });
    const cloud = await fakeAnswerModels(page);
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    await explainButton(page).click();
    await expect(page.getByTestId('send-panel')).toHaveAttribute('data-destination', 'device-first');
    await expect(page.getByTestId('send-panel')).toContainText("if this device can't write it itself");
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(shortAnswer(page)).toContainText('written on this device');
    await expect(shortAnswer(page).getByTestId('inference-badge')).toHaveAttribute('data-source', 'ON_DEVICE');
    expect(cloud.bodies).toHaveLength(0);
    await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');

    // "Tell me more" goes to the cloud first: the step comes back, with the cloud wording.
    await page.getByRole('button', { name: 'Tell me more' }).click();
    const panel = page.getByTestId('explain-long').getByTestId('send-panel');
    await expect(panel).toHaveAttribute('data-destination', 'cloud');
    await expect(panel).toContainText('will be sent to Firebase AI Logic in the cloud');
    expect(cloud.bodies).toHaveLength(0);
    await decision(page).getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('explain-long').getByTestId('answer')).toBeVisible();
    expect(cloud.bodies).toHaveLength(1);
  });

  test('without a device model, the next request goes without the step and says it carries nothing about the person; other answers change nothing', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeAnswerModels(page);
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    await explainButton(page).click();
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(shortAnswer(page)).toBeVisible();

    await page.getByRole('button', { name: 'How do I apply?' }).click();
    const chip = page.getByTestId('chip-apply');
    await expect(chip.getByTestId('answer')).toBeVisible();
    await expect(chip.getByTestId('send-panel')).toHaveCount(0);
    await expect(chip.getByTestId('send-once')).toContainText('Nothing about you.');
    expect(cloud.bodies).toHaveLength(2);

    // Household 3 → 4: the requests carry nothing about the person, so the answer is the same one.
    await page.goto('/#/q/householdSize?then=program/utility-discount');
    await page.locator('#main input[inputmode="numeric"]').fill('4');
    await page.getByRole('button', { name: /^(Next|See results|None of these)$/ }).click();
    await expect(page.getByTestId('verdict-card')).toBeVisible();
    await expect(shortAnswer(page)).toBeVisible();
    expect(cloud.bodies).toHaveLength(2);
  });

  test('after "Keep everything on this device" the button is still there, and nothing was sent', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeAnswerModels(page);
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    await explainButton(page).click();
    await page.getByTestId('send-decision').getByRole('button', { name: 'Keep on device' }).click();
    await expect(page.getByTestId('explain-short').getByTestId('request-status')).toHaveText(/Nothing was sent/);
    await expect(explainButton(page)).toBeVisible();
    expect(cloud.bodies).toHaveLength(0);
    await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');
  });

  test('"Why this result" shows limits and values from the rules; the general explanation never states a result', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeAnswerModels(page, { text: () => 'You may qualify for this program.' });
    await page.goto('/');
    await completeQuickCheck(page, { resident: 'No' });
    await openProgram(page, 'food-help');
    await expect(page.getByTestId('verdict-card')).toHaveAttribute('data-verdict', 'unlikely');
    // A "Probably not" is a first check, not a decision: the page says so, and that the person can still apply.
    await expect(page.getByTestId('unlikely-note')).toHaveText('This is a first check from the answers you gave, not a decision. The agency decides, and you can still apply.');
    const why = page.getByTestId('why-section');
    await expect(why.getByTestId('why-income-limit').getByTestId('why-limit')).toContainText(/Limit\s*\$34,000\s*You\s*\$30,524/);
    await expect(why.getByTestId('why-residency')).toHaveAttribute('data-state', 'fail');
    await expect(why.getByTestId('why-unavailable')).toContainText('needs a model on this device');

    await explainButton(page).click();
    await page.getByRole('button', { name: 'Send' }).click();
    // Asked twice, both replies stated a result: neither is shown.
    const error = page.getByTestId('explain-short').getByTestId('answer-error');
    await expect(error).toHaveAttribute('data-kind', 'blocked');
    await expect(error).toContainText('only the rules can make');
    await expect(page.getByText('You may qualify for this program.')).toHaveCount(0);
    expect(cloud.bodies).toHaveLength(2);
    for (const body of cloud.bodies) {
      expect(body).not.toMatch(/Verdict|not-eligible|residentStatus|30524|incomeBand|Checked on the device/);
      expect(body).toContain('This program checks: Your income is under the limit for your household size; You meet the residency rule.');
    }
  });

  test('with a device model, the person\'s own result is explained on this device only', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'available', replies: { 'Result from the rules: Probably not': 'The rules say probably not: the residency rule is not met.' } });
    const cloud = await fakeAnswerModels(page);
    await page.goto('/');
    await completeQuickCheck(page, { resident: 'No' });
    await openProgram(page, 'food-help');
    await page.getByRole('button', { name: 'Explain my result on this device' }).click();
    const answer = page.getByTestId('why-answer');
    await expect(answer).toContainText('residency rule is not met');
    await expect(answer.getByTestId('inference-badge')).toHaveAttribute('data-reason', 'your-result-stays-on-device');
    await expect(answer.getByRole('button', { name: 'Read aloud' })).toHaveCount(0);
    const prompts = await page.evaluate(() => (window as unknown as { __fakePrompts: string[] }).__fakePrompts.join('\n'));
    expect(prompts).toContain('limit 34,000, yours 30,524');
    // Recorded as kept, under its own title.
    const bar = page.getByTestId('leaving-bar');
    await expect(bar).toHaveAttribute('data-kept-count', '1');
    await bar.getByRole('button', { name: 'Details' }).click();
    await expect(bar.locator('li[data-status="answered"]')).toContainText('Why this result');
    expect(cloud.bodies).toHaveLength(0);
    await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');
  });

  test('prepared questions work without a device model; typed questions are offered only with one, and say why; focus stays on the chip', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeAnswerModels(page, { text: (p) => (p.includes('Question: How do I apply?') ? 'Apply on the official website.' : 'x') });
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    await expect(page.getByTestId('free-text-unavailable')).toContainText('needs a model on this device');
    await expect(page.getByRole('textbox')).toHaveCount(0);
    const chipButton = page.getByRole('button', { name: 'How do I apply?' });
    await chipButton.click();
    await expect(page.getByTestId('send-lines')).toContainText('Question: How do I apply?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(chipButton).toBeFocused();
    const answer = page.getByTestId('chip-apply').getByTestId('answer');
    await expect(answer).toContainText('Apply on the official website.');
    await expect(answer.getByTestId('inference-badge')).toHaveAttribute('data-reason', 'prepared-question');
    await expect(chipButton).toBeFocused();
    // A second chip goes without the step (nothing about the person; agreed once) and keeps focus on itself.
    const second = page.getByRole('button', { name: 'What papers might I need?' });
    await second.click();
    await expect(page.getByTestId('chip-documents').getByTestId('answer')).toBeVisible();
    await expect(second).toBeFocused();
    expect(cloud.bodies).toHaveLength(2);
  });

  test('a typed question is answered on this device and never sent', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'available', replies: { 'Question: Can I apply from abroad?': 'Check the official website.' } });
    const cloud = await fakeAnswerModels(page);
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    await page.getByRole('textbox', { name: 'Your own question' }).fill('Can I apply from abroad?');
    await page.getByRole('button', { name: 'Ask on this device' }).click();
    const answer = page.getByTestId('free-text').getByTestId('answer');
    await expect(answer).toContainText('Check the official website.');
    await expect(answer.getByTestId('inference-badge')).toHaveAttribute('data-source', 'ON_DEVICE');
    await expect(answer.getByTestId('inference-badge')).toHaveAttribute('data-reason', 'typed-text-may-be-personal');
    await expect(answer.getByRole('button', { name: 'Read aloud' })).toHaveCount(0);
    expect(cloud.bodies.join('\n')).not.toContain('abroad');
  });

  test('once something has left, the results lead says so', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeAnswerModels(page);
    await page.goto('/');
    await completeQuickCheck(page);
    await expect(page.getByTestId('results-lead')).toContainText('Nothing you entered has been sent anywhere');
    await openProgram(page, 'utility-discount');
    await explainButton(page).click();
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(shortAnswer(page)).toBeVisible();
    await page.goto('/#/results');
    await expect(page.getByTestId('results-lead')).toContainText('Only what is listed under “Leaving your device” has left it.');
    await expect(page.getByTestId('results-lead')).not.toContainText('Nothing you entered');
  });

  test('a daily limit says so, without "try again in a minute" or a retry button', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeAnswerModels(page, { error: { status: 429, message: 'Quota exceeded for metric: generativelanguage.googleapis.com/generate_requests_per_model_per_day, limit: 500. Please retry in 15h42m.' } });
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    await explainButton(page).click();
    await page.getByRole('button', { name: 'Send' }).click();
    const error = page.getByTestId('explain-short').getByTestId('answer-error');
    await expect(error).toHaveAttribute('data-kind', 'quota-daily');
    await expect(error).toContainText("free daily limit has been reached");
    await expect(error).not.toContainText('in a minute');
    await expect(error.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  });

  test('a request that does not answer can be cancelled, and says when it is slow', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await page.clock.install();
    const cloud = await fakeAnswerModels(page, { hang: true });
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    await explainButton(page).click();
    await page.getByRole('button', { name: 'Send' }).click();
    const status = page.getByTestId('explain-short').getByTestId('request-status');
    await expect(status).toHaveText('Writing the answer…');
    await page.clock.fastForward(16_000);
    await expect(status).toContainText('This is taking longer than usual.');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(status).toHaveText('Cancelled. Nothing more will be shown for this request.');
    await expect(explainButton(page)).toBeVisible();
    expect(cloud.bodies).toHaveLength(1);
    // The record says truthfully that the request did not complete.
    const bar = page.getByTestId('leaving-bar');
    await bar.getByRole('button', { name: 'Details' }).click();
    await expect(bar.locator('li[data-channel="ai-cloud"]')).toHaveAttribute('data-status', 'failed');
  });

  test('a language change never leaves an answer in the old language; the panel shows translated values', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeAnswerModels(page);
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    await explainButton(page).click();
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(shortAnswer(page)).toBeVisible();
    await chooseLanguage(page, 'es');
    await expect(page.getByRole('heading', { name: 'Sobre este programa' })).toBeVisible();
    await expect(shortAnswer(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Explicar este programa' }).click();
    // Already sent once in this session: no step, but it says so; nothing is re-sent without a tap.
    await expect(shortAnswer(page)).toBeVisible();
    expect(cloud.bodies).toHaveLength(2);
    await page.getByTestId('chip-apply').getByRole('button').click();
    await expect(page.getByTestId('chip-apply').getByTestId('send-once')).toBeVisible();
  });

  test('a Spanish prepared question is checked against the Spanish list', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeAnswerModels(page, { text: () => 'Calificas para esta ayuda.' });
    await page.goto('/');
    await completeQuickCheck(page);
    await chooseLanguage(page, 'es');
    await openProgram(page, 'utility-discount');
    await page.getByRole('button', { name: '¿Cómo solicito?' }).click();
    await decision(page).getByRole('button', { name: 'Enviar' }).click();
    const error = page.getByTestId('chip-apply').getByTestId('answer-error');
    await expect(error).toHaveAttribute('data-kind', 'blocked');
    await expect(page.getByText('Calificas para esta ayuda.')).toHaveCount(0);
    expect(cloud.bodies).toHaveLength(2);
  });

  test('translated step before sending', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeAnswerModels(page);
    await page.goto('/');
    await completeQuickCheck(page);
    await chooseLanguage(page, 'es');
    await openProgram(page, 'utility-discount');
    await page.getByRole('button', { name: 'Explicar este programa' }).click();
    const lines = page.getByTestId('send-lines');
    await expect(lines).toContainText('Programa: Descuento de servicios públicos (prueba)');
    await expect(lines).not.toContainText('Rango de ingresos');
    await expect(page.getByTestId('send-payload')).toHaveCount(0);
    await page.getByText('Mostrar la solicitud exacta').click();
    await expect(page.getByTestId('send-payload')).toContainText('Este programa revisa:');
  });

  test('with the flags off every page is complete: official information and the way back, no dead buttons', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeAnswerModels(page);
    await page.goto('/');
    await completeQuickCheck(page);
    await expect(page.getByTestId('more-help')).toHaveCount(0);
    await openProgram(page, 'utility-discount');
    await expect(page.getByTestId('current-section')).toHaveCount(0);
    await expect(page.getByTestId('official-info')).toContainText('This demo rule set lists no official websites.');
    for (const path of ['/#/discover', '/#/nearby']) {
      await page.goto(path);
      const screen = page.getByTestId(path.includes('discover') ? 'discover-screen' : 'nearby-screen');
      await expect(screen).toHaveAttribute('data-enabled', 'false');
      await expect(screen.getByRole('button')).toHaveCount(0);
      // The way back is the page's main action (in the dock, or in the content on wide screens).
      await expect(page.locator('[data-testid="bottom-block"], [data-testid="screen-actions"]').getByRole('link', { name: 'Back to results' })).toBeVisible();
      const back = screen.getByTestId('back-nav');
      await expect(back.getByRole('link')).toHaveCount(6);
      await expect(back.getByRole('link', { name: 'Test Food Help' })).toBeVisible();
      await expect(back).toContainText('You may qualify');
    }
  });

  test('current information: one search for every program, Search Suggestions and sources shown as given', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await seedRemoteConfig(context, ALL_ON);
    const cloud = await fakeAnswerModels(page, {}, ALL_ON);
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    await page.getByRole('button', { name: 'Check current information for all 5 programs' }).click();
    const lines = page.getByTestId('current-status').getByTestId('send-lines');
    await expect(lines).toContainText('Test Work Credit');
    await expect(lines).not.toContainText('Income range');
    await decision(page).getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('current-line')).toHaveText('Applications are open all year.');
    await expect(page.getByTestId('current-status').getByTestId('inference-badge')).toHaveAttribute('data-reason', 'needs-current-info');
    await expect(page.getByTestId('sources').getByRole('link', { name: 'example.gov' })).toHaveAttribute('target', '_blank');
    await expect(page.getByTestId('search-suggestions').getByRole('link', { name: 'test food help' })).toBeVisible();
    const body = cloud.bodies[0]!;
    for (const id of ['work-credit', 'food-help', 'utility-discount', 'phone-discount', 'senior-food']) expect(body).toContain(`[${id}]`);
    expect(body).toContain('googleSearch');
    expect(body).not.toContain('incomeBand');
    await openProgram(page, 'food-help');
    await expect(page.getByTestId('current-line')).toHaveText('No current information found.');
    expect(cloud.bodies).toHaveLength(1);
  });

  test('leads are a separate "not verified" section with sources', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await seedRemoteConfig(context, ALL_ON);
    const cloud = await fakeAnswerModels(page, {}, ALL_ON);
    await page.goto('/');
    await completeQuickCheck(page);
    await page.getByTestId('more-help').getByRole('link', { name: 'Other help you could look into' }).click();
    await page.getByRole('button', { name: 'Look for other help' }).click();
    await page.getByRole('button', { name: 'Send' }).click();
    const leads = page.getByTestId('leads');
    await expect(leads.getByRole('heading', { name: 'Leads — not verified' })).toBeVisible();
    await expect(leads).toContainText('City Fan Program');
    await expect(leads.getByTestId('search-suggestions')).toBeVisible();
    expect(cloud.bodies[0]).toContain('Already listed');
    expect(cloud.bodies[0]).not.toContain('30524');
  });

  test('help near you sends the county center only and shows the Google Maps attribution', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await seedRemoteConfig(context, ALL_ON);
    const cloud = await fakeAnswerModels(page, {}, ALL_ON);
    await page.goto('/');
    await completeQuickCheck(page);
    await page.goto('/#/nearby');
    await page.getByLabel('Your county').selectOption('testshire');
    await page.getByRole('button', { name: 'Find help near the county center' }).click();
    await expect(page.getByTestId('send-lines')).toContainText("the county's center point, not your location");
    await page.getByRole('button', { name: 'Send' }).click();
    const places = page.getByTestId('places');
    await expect(places.getByRole('link', { name: 'Testshire Help Center' })).toHaveAttribute('href', 'https://maps.google.com/?cid=123');
    await expect(places.getByTestId('maps-attribution')).toHaveText('Google Maps');
    const body = JSON.parse(cloud.bodies[0]!) as { toolConfig: unknown; tools: unknown };
    expect(body.tools).toEqual([{ googleMaps: {} }]);
    expect(body.toolConfig).toMatchObject({ retrievalConfig: { latLng: { latitude: 0, longitude: 0 } } });
  });

  test('read aloud sends only the answer text to the speech model, after its own step', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await seedRemoteConfig(context, ALL_ON);
    const cloud = await fakeAnswerModels(page, {}, ALL_ON);
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    await explainButton(page).click();
    await page.getByRole('button', { name: 'Send' }).click();
    const answer = shortAnswer(page);
    await answer.getByRole('button', { name: 'Read aloud' }).click();
    await expect(answer.getByTestId('send-lines')).toContainText('The text of the answer above');
    await decision(page).getByRole('button', { name: 'Send' }).click();
    await expect(answer.getByText(/Reading aloud\.|Stopped reading\./)).toBeVisible();
    expect(cloud.paths[1]).toContain('gemini-3.1-flash-tts-preview');
    expect(cloud.bodies[1]).toContain('This program lowers utility bills');
    expect(cloud.bodies[1]).not.toContain('incomeBand');
  });
});

test.describe('narrow screens and zoom', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('the open record and a long unbroken answer never make the page scroll sideways; the reason pill is one block', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeAnswerModels(page, { text: () => `See ${'https://example.org/'.padEnd(260, 'x')} for details.` });
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    await explainButton(page).click();
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(shortAnswer(page)).toBeVisible();
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    // The pill is one box of wrapping text: never a flex container that splits into columns.
    expect(await shortAnswer(page).locator('.chip').evaluate((el) => getComputedStyle(el).display)).not.toMatch(/flex/);
    const bar = page.getByTestId('leaving-bar');
    await bar.getByRole('button', { name: 'Details' }).click();
    await bar.getByText('Show exactly what was sent').first().click();
    expect(await overflow()).toBeLessThanOrEqual(0);
    const list = bar.getByTestId('outbound-list');
    expect(await list.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    // The open record leaves part of the screen for the page (200 % zoom is about 640 x 320 CSS px).
    await page.setViewportSize({ width: 640, height: 320 });
    const panelHeight = await page.getByTestId('record-sheet').evaluate((el) => el.getBoundingClientRect().height);
    expect(panelHeight).toBeLessThanOrEqual(320 * 0.6 + 1);
  });
});
