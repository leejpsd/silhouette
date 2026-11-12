import { readFileSync } from 'node:fs';
import type { BrowserContext, Page, Request } from '@playwright/test';

export const AI_HOST = 'firebasevertexai.googleapis.com';
const shared = (rel: string) => readFileSync(new URL(`../../shared/${rel}`, import.meta.url), 'utf8');

export const fixturePointers = (id: string): Record<string, unknown> =>
  (JSON.parse(shared('fixtures/conformance/rehydrate.json')) as { cases: { id: string; pointers: Record<string, unknown> }[] }).cases.find(
    (c) => c.id === id,
  )!.pointers;

export const sharedText = shared;

/** A Gemini generateContent response whose text is `json` (what the real API returns for JSON mode). */
export function geminiResponse(json: unknown) {
  return {
    candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(json) }] }, finishReason: 'STOP', index: 0 }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
  };
}

/** Answers every AI Logic request with `pointers` (or an error) and records the request bodies. */
export async function fakeCloudModel(
  page: Page,
  reply: { pointers: unknown } | { status: number; body: unknown },
): Promise<{ bodies: string[] }> {
  const bodies: string[] = [];
  await fakeFirebaseBackends(page);
  await page.route(`https://${AI_HOST}/**`, async (route) => {
    bodies.push(route.request().postData() ?? '');
    if ('pointers' in reply) await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(geminiResponse(reply.pointers)) });
    else await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) });
  });
  return { bodies };
}

/** Collects every request the page makes (URL, headers, body) for leak checks. */
export function recordRequests(page: Page): Request[] {
  const all: Request[] = [];
  page.on('request', (r) => all.push(r));
  return all;
}

/** Simulates a browser without Chrome's Prompt API (Playwright's Chromium exposes one that reports "downloadable"). */
export async function noOnDeviceModel(context: BrowserContext) {
  await context.addInitScript(() => {
    delete (window as unknown as { LanguageModel?: unknown }).LanguageModel;
  });
}

/** Placeholder id of the first token with this exact text in a skeleton fixture case. */
export function placeholderFor(caseId: string, text: string): string {
  const fixture = JSON.parse(shared('fixtures/conformance/skeleton.json')) as { cases: { id: string; expected: { map: Record<string, string> } }[] };
  const map = fixture.cases.find((c) => c.id === caseId)!.expected.map;
  const id = Object.keys(map).find((k) => map[k] === text);
  if (!id) throw new Error(`${text} not in ${caseId}`);
  return id;
}

/**
 * Installs a fake Chrome Prompt API (window.LanguageModel) so the on-device branch of Firebase
 * AI Logic can run in Playwright's Chromium, which has no Gemini Nano. `availability` is what
 * availability() reports; prompts get `reply(promptText)`.
 */
export async function fakeOnDeviceModel(
  context: BrowserContext,
  options: { availability: string; replies: Record<string, string>; throwMessage?: string; initialPromptTooLarge?: boolean },
) {
  await context.addInitScript((opts) => {
    let state = opts.availability;
    const prompts: string[] = [];
    (window as unknown as { __fakePrompts: string[] }).__fakePrompts = prompts;
    class FakeSession {
      async prompt(input: unknown) {
        const text = JSON.stringify(input);
        prompts.push(text);
        if (opts.throwMessage) throw new DOMException(opts.throwMessage, 'QuotaExceededError');
        for (const [needle, reply] of Object.entries(opts.replies)) if (text.includes(needle)) return reply;
        return '{}';
      }
      destroy() {}
    }
    (window as unknown as { LanguageModel: unknown }).LanguageModel = {
      availability: async () => state,
      create: async (o?: { monitor?: (m: EventTarget) => void; initialPrompts?: unknown[] }) => {
        // Like Chromium's small built-in model: a long initial prompt does not fit its context.
        if (opts.initialPromptTooLarge && o?.initialPrompts?.length) throw new DOMException('The input is too large.', 'QuotaExceededError');
        if (state === 'downloadable' || state === 'downloading') {
          const monitor = new EventTarget();
          o?.monitor?.(monitor);
          for (const loaded of [0.25, 0.5, 1]) {
            await new Promise((r) => setTimeout(r, 30));
            monitor.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded, total: 1 }));
          }
          state = 'available';
        }
        return new FakeSession();
      },
    };
  }, options);
}

/** Remote Config values for a test, seeded as the app's last fetched values (no fetch needed). */
export async function seedRemoteConfig(context: BrowserContext, values: Record<string, string>) {
  await context.addInitScript((v) => {
    if (!sessionStorage.getItem('seeded-rc')) {
      localStorage.setItem('silhouette.remote-config', JSON.stringify(v));
      sessionStorage.setItem('seeded-rc', '1');
    }
  }, values);
}

/**
 * Firebase Installations and Remote Config, faked so tests never reach Google. Remote Config answers
 * with `entries` (the template's parameter values as strings).
 */
export async function fakeFirebaseBackends(page: Page, entries: Record<string, string> = {}) {
  await page.route('https://firebaseinstallations.googleapis.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ name: 'projects/p/installations/fake', fid: 'fakeFid0000000000000000', refreshToken: 'r', authToken: { token: 't', expiresIn: '604800s' } }),
    }),
  );
  await page.route('https://firebaseremoteconfig.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries, state: 'UPDATE', templateVersion: '1' }) }),
  );
}

export const SEARCH_SUGGESTIONS_HTML =
  '<style>.container{display:flex;gap:8px}.chip{border:1px solid #ccc;border-radius:16px;padding:4px 10px}</style>' +
  '<div class="container"><a class="chip" href="https://www.google.com/search?q=test+food+help">test food help</a></div>';

interface AnswerFakes {
  /** Text for explanations and chip answers; the prompt is passed in. */
  text?: (prompt: string) => string;
  /** Answer with this HTTP error instead (for example a daily-limit 429). */
  error?: { status: number; message: string };
  /** Never answer. */
  hang?: boolean;
  status?: string;
  leads?: string;
  places?: string;
}

/**
 * Answers each AI Logic request in the shape the real API uses for its task: plain text for
 * explanations and chips, text with groundingMetadata for Search and Maps, inline audio for speech.
 * Records every request body.
 */
export async function fakeAnswerModels(
  page: Page,
  fakes: AnswerFakes = {},
  remoteConfig: Record<string, string> = {},
): Promise<{ bodies: string[]; paths: string[] }> {
  const bodies: string[] = [];
  const paths: string[] = [];
  await fakeFirebaseBackends(page, remoteConfig);
  await page.route(`https://${AI_HOST}/**`, async (route) => {
    const body = route.request().postData() ?? '';
    bodies.push(body);
    paths.push(new URL(route.request().url()).pathname);
    if (fakes.hang) return;
    if (fakes.error) {
      await route.fulfill({ status: fakes.error.status, contentType: 'application/json', body: JSON.stringify({ error: { code: fakes.error.status, message: fakes.error.message, status: 'RESOURCE_EXHAUSTED' } }) });
      return;
    }
    const json = JSON.parse(body) as { contents?: { parts?: { text?: string }[] }[]; tools?: Record<string, unknown>[] };
    const prompt = (json.contents ?? []).flatMap((c) => c.parts ?? []).map((p) => p.text ?? '').join('\n');
    const tool = Object.keys(json.tools?.[0] ?? {})[0];
    let candidate: Record<string, unknown>;
    if (route.request().url().includes('-tts')) {
      const silence = Buffer.alloc(4800).toString('base64');
      candidate = { content: { role: 'model', parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: silence } }] } };
    } else if (tool === 'googleSearch') {
      const text = prompt.includes('Already listed') ? (fakes.leads ?? '- City Fan Program: free fans in summer.') : (fakes.status ?? '[utility-discount] Applications are open all year.\n[food-help] No current information found.');
      candidate = {
        content: { role: 'model', parts: [{ text }] },
        groundingMetadata: {
          searchEntryPoint: { renderedContent: SEARCH_SUGGESTIONS_HTML },
          groundingChunks: [{ web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title: 'example.gov' } }],
          webSearchQueries: ['test food help'],
        },
      };
    } else if (tool === 'googleMaps') {
      candidate = {
        content: { role: 'model', parts: [{ text: fakes.places ?? '- Testshire Help Center: help with benefit applications.' }] },
        groundingMetadata: {
          groundingChunks: [{ maps: { uri: 'https://maps.google.com/?cid=123', title: 'Testshire Help Center', text: 'Open weekdays', placeId: 'places/abc' } }],
        },
      };
    } else {
      candidate = { content: { role: 'model', parts: [{ text: fakes.text ? fakes.text(prompt) : 'This program lowers utility bills for households that rent or own their home and stay under an income limit.' }] } };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ ...candidate, finishReason: 'STOP', index: 0 }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }),
    });
  });
  return { bodies, paths };
}
