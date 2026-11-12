import { expect, test, type Page } from '@playwright/test';
import { completeQuickCheck } from './helpers';
import { fakeAnswerModels, fakeOnDeviceModel, noOnDeviceModel, seedRemoteConfig } from './model-fakes';

const ALL_ON = { feature_grounding_search: 'true', feature_grounding_maps: 'true', feature_tts: 'true' };

async function openProgram(page: Page, id: string) {
  await page.goto(`/#/program/${id}`);
  await expect(page.getByTestId('verdict-card')).toBeVisible();
}

test.describe('explanations, questions and current information', () => {
  test('nothing is requested until a tap; the panel shows the silhouette and the exact request, then the answer carries its provenance', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeAnswerModels(page);
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    await expect(page.getByTestId('explain-section')).toBeVisible();
    expect(cloud.bodies).toHaveLength(0);
    await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');

    await page.getByRole('button', { name: 'Explain this result' }).click();
    const panel = page.getByTestId('send-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Leaving your device' })).toBeFocused();
    await expect(page.getByTestId('send-lines')).toContainText('Income range: C (30,000–44,999)');
    await expect(page.getByTestId('send-lines')).toContainText('Household size: 3');
    await expect(page.getByTestId('send-lines')).toContainText('Program: Test Utility Discount');
    await panel.getByText('Show the exact request').click();
    const payload = await page.getByTestId('send-payload').textContent();
    expect(payload).toContain('\\"incomeBand\\":\\"C\\"');
    expect(payload).not.toContain('30524');
    expect(cloud.bodies).toHaveLength(0);

    await panel.getByRole('button', { name: 'Send' }).click();
    const answer = page.getByTestId('explain-short').getByTestId('answer');
    await expect(answer).toContainText('You may qualify because');
    const badge = answer.getByTestId('inference-badge');
    await expect(badge).toHaveAttribute('data-source', 'IN_CLOUD');
    await expect(badge).toHaveAttribute('data-reason', 'short-text');
    await expect(badge).toContainText('60 words, limit 80');
    // The result from the rules stays first and unchanged.
    await expect(page.getByTestId('verdict-card')).toHaveAttribute('data-verdict', 'likely');

    expect(cloud.bodies).toHaveLength(1);
    const sent = JSON.parse(cloud.bodies[0]!) as { contents: { parts: { text: string }[] }[]; systemInstruction: { parts: { text: string }[] } };
    const text = sent.contents[0]!.parts[0]!.text;
    // The request is what the panel showed.
    expect(payload).toContain(JSON.stringify(text).slice(1, 40));
    expect(text).toContain('"incomeBand":"C"');
    for (const exact of ['30524', '30,524', 'residentStatus', 'eligible']) expect(cloud.bodies[0]).not.toContain(exact);
    await expect(page.getByTestId('leaving-bar')).toContainText('Profile silhouette');

    // Same silhouette, another program: no second panel; the request is still recorded.
    await openProgram(page, 'food-help');
    await page.getByRole('button', { name: 'Explain this result' }).click();
    await expect(page.getByTestId('explain-short').getByTestId('answer')).toBeVisible();
    await expect(page.getByTestId('send-panel')).toHaveCount(0);
    // food-help depends on a private answer the silhouette does not carry: the explanation says so.
    await expect(page.getByTestId('silhouette-note')).toBeVisible();
    expect(cloud.bodies).toHaveLength(2);

    // Cached for the session: going back shows the answer without a new request.
    await openProgram(page, 'utility-discount');
    await expect(page.getByTestId('explain-short').getByTestId('answer')).toBeVisible();
    expect(cloud.bodies).toHaveLength(2);

    // "Tell me more" is explain.long.
    await page.getByRole('button', { name: 'Tell me more' }).click();
    const long = page.getByTestId('explain-long').getByTestId('inference-badge');
    await expect(long).toHaveAttribute('data-reason', 'long-or-unsupported-locale');
    await expect(long).toContainText('180 words, limit 80');
  });

  test('keeping everything on the device sends nothing', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeAnswerModels(page);
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    await page.getByRole('button', { name: 'Explain this result' }).click();
    await page.getByRole('button', { name: 'Keep everything on this device' }).click();
    await expect(page.getByText('Nothing was sent.')).toBeVisible();
    expect(cloud.bodies).toHaveLength(0);
    await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');
  });

  test('prepared questions work without a device model; typed questions are offered only with one, and say why', async ({ page, context }) => {
    await noOnDeviceModel(context);
    const cloud = await fakeAnswerModels(page, { text: (p) => (p.includes('Question: How do I apply?') ? 'Apply on the official website.' : 'x') });
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    await expect(page.getByTestId('free-text-unavailable')).toContainText('needs a model on this device');
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await page.getByRole('button', { name: 'How do I apply?' }).click();
    await expect(page.getByTestId('send-lines')).toContainText('Question: How do I apply?');
    await page.getByRole('button', { name: 'Send' }).click();
    const answer = page.getByTestId('chip-apply').getByTestId('answer');
    await expect(answer).toContainText('Apply on the official website.');
    await expect(answer.getByTestId('inference-badge')).toHaveAttribute('data-reason', 'prepared-question');
    expect(cloud.bodies).toHaveLength(1);
  });

  test('a typed question is answered on this device and never sent', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'available', replies: { 'Question: Can I apply from abroad?': 'Check the official website.' } });
    const cloud = await fakeAnswerModels(page);
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    const box = page.getByLabel('Your own question');
    await box.fill('Can I apply from abroad?');
    await page.getByRole('button', { name: 'Ask on this device' }).click();
    const answer = page.getByTestId('free-text').getByTestId('answer');
    await expect(answer).toContainText('Check the official website.');
    await expect(answer.getByTestId('inference-badge')).toHaveAttribute('data-source', 'ON_DEVICE');
    await expect(answer.getByTestId('inference-badge')).toHaveAttribute('data-reason', 'typed-text-may-be-personal');
    await expect(answer.getByRole('button', { name: 'Read aloud' })).toHaveCount(0);
    expect(cloud.bodies.join('\n')).not.toContain('abroad');
  });

  test('with the flags off every page is complete: official information, no dead buttons', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeAnswerModels(page);
    await page.goto('/');
    await completeQuickCheck(page);
    await expect(page.getByTestId('more-help')).toHaveCount(0);
    await openProgram(page, 'utility-discount');
    await expect(page.getByTestId('current-section')).toHaveCount(0);
    await expect(page.getByTestId('official-info')).toContainText('This demo rule set lists no official websites.');
    await page.goto('/#/discover');
    await expect(page.getByTestId('discover-screen')).toHaveAttribute('data-enabled', 'false');
    await expect(page.getByTestId('discover-screen')).toContainText('not switched on');
    await expect(page.getByTestId('discover-screen').getByRole('button')).toHaveCount(0);
    await page.goto('/#/nearby');
    await expect(page.getByTestId('nearby-screen')).toHaveAttribute('data-enabled', 'false');
    await expect(page.getByTestId('nearby-screen').getByRole('button')).toHaveCount(0);
  });

  test('current information: one search for every program, Search Suggestions and sources shown as given', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await seedRemoteConfig(context, ALL_ON);
    const cloud = await fakeAnswerModels(page, {}, ALL_ON);
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    await page.getByRole('button', { name: 'Check current information for all 5 programs' }).click();
    const lines = page.getByTestId('send-lines');
    await expect(lines).toContainText('Test Work Credit');
    await expect(lines).toContainText('Test Senior Food Path');
    await expect(lines).not.toContainText('Income range');
    await page.getByRole('button', { name: 'Send' }).click();
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
    await expect(leads).toContainText('does not say whether you qualify');
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
    await expect(places.getByTestId('inference-badge')).toHaveAttribute('data-reason', 'needs-places');
    const body = JSON.parse(cloud.bodies[0]!) as { toolConfig: unknown; tools: unknown };
    expect(body.tools).toEqual([{ googleMaps: {} }]);
    expect(body.toolConfig).toMatchObject({ retrievalConfig: { latLng: { latitude: 0, longitude: 0 } } });
    expect(cloud.bodies[0]).not.toContain('incomeBand');
  });

  test('read aloud sends only the answer text to the speech model, after its own Send', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await seedRemoteConfig(context, ALL_ON);
    const cloud = await fakeAnswerModels(page, {}, ALL_ON);
    await page.goto('/');
    await completeQuickCheck(page);
    await openProgram(page, 'utility-discount');
    await page.getByRole('button', { name: 'Explain this result' }).click();
    await page.getByRole('button', { name: 'Send' }).click();
    const answer = page.getByTestId('explain-short').getByTestId('answer');
    await answer.getByRole('button', { name: 'Read aloud' }).click();
    await expect(answer.getByTestId('send-lines')).toContainText('The text of the answer above');
    await answer.getByRole('button', { name: 'Send' }).click();
    await expect(answer.getByText(/Reading aloud\.|Stopped reading\./)).toBeVisible();
    expect(cloud.paths[1]).toContain('gemini-3.1-flash-tts-preview');
    const body = JSON.parse(cloud.bodies[1]!) as { contents: { parts: { text: string }[] }[]; systemInstruction?: unknown };
    expect(body.contents[0]!.parts[0]!.text).toContain('You may qualify because');
    expect(cloud.bodies[1]).not.toContain('incomeBand');
    await expect(page.getByTestId('leaving-bar')).toContainText('Answer text (read aloud)');
  });
});
