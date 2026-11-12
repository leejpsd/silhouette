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
  options: { availability: string; replies: Record<string, string>; throwMessage?: string },
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
      create: async (o?: { monitor?: (m: EventTarget) => void }) => {
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
