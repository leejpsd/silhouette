// Which Firebase app a task's model is made on, in which inference mode, and when App Check (and with
// it reCAPTCHA) starts. The Firebase SDK is replaced by recorders; the placing of each request is
// Firebase AI Logic's (see device-extraction.test.ts for a stand-in that places them as it does).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({
  apps: [] as string[],
  deleted: [] as string[],
  models: [] as { app: string; mode: unknown }[],
  appChecks: [] as { app: string; provider: string }[],
  recaptchaKeys: [] as string[],
  limitedUse: [] as string[],
  providers: [] as { getToken: () => Promise<{ token: string; expireTimeMillis: number }> }[],
}));

vi.mock('firebase/app', () => ({
  initializeApp: (_config: unknown, name = '[DEFAULT]') => {
    log.apps.push(name);
    return { name };
  },
  deleteApp: async (app: { name: string }) => void log.deleted.push(app.name),
}));

vi.mock('firebase/app-check', () => {
  class CustomProvider {
    constructor(readonly options: { getToken: () => Promise<{ token: string; expireTimeMillis: number }> }) {
      log.providers.push(options);
    }
  }
  class ReCaptchaEnterpriseProvider {
    constructor(siteKey: string) {
      log.recaptchaKeys.push(siteKey);
    }
  }
  return {
    CustomProvider,
    ReCaptchaEnterpriseProvider,
    initializeAppCheck: (app: { name: string }, options: { provider: object }) => {
      log.appChecks.push({ app: app.name, provider: options.provider instanceof ReCaptchaEnterpriseProvider ? 'recaptcha-enterprise' : 'custom' });
      return { app };
    },
    getLimitedUseToken: async (appCheck: { app: { name: string } }) => {
      log.limitedUse.push(appCheck.app.name);
      // A JWT whose payload is {"exp": 2000000000}.
      return { token: `h.${btoa(JSON.stringify({ exp: 2_000_000_000 })).replace(/=+$/, '')}.s` };
    },
  };
});

vi.mock('firebase/ai', () => ({
  InferenceMode: { PREFER_ON_DEVICE: 'prefer_on_device', ONLY_ON_DEVICE: 'only_on_device', ONLY_IN_CLOUD: 'only_in_cloud', PREFER_IN_CLOUD: 'prefer_in_cloud' },
  GoogleAIBackend: class {},
  getAI: (app: { name: string }) => ({ app }),
  getGenerativeModel: (ai: { app: { name: string } }, params: { mode: unknown }) => {
    log.models.push({ app: ai.app.name, mode: params.mode });
    return {
      generateContent: async () => ({ response: { text: () => 'ok', inferenceSource: 'on_device' } }),
      initializeDeviceModel: async () => undefined,
    };
  },
}));

vi.mock('../data/net-monitor', () => ({ onFirstCloudRequest: () => undefined }));

const firebase = await import('./firebase');

const params = (mode: string) => ({ mode, inCloudParams: { model: 'm' }, onDeviceParams: { createOptions: {} } }) as never;

beforeEach(() => {
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_RECAPTCHA_SITE_KEY', 'test-site-key');
  vi.stubGlobal('document', { getElementById: () => null });
  for (const list of Object.values(log)) list.length = 0;
});

afterEach(async () => {
  await firebase.shutdownFirebase();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('the SDK, not the app, places a device-first request', () => {
  it('a PREFER_ON_DEVICE task gets one model in PREFER_ON_DEVICE, on the hybrid app; no ONLY_* model is made for it', async () => {
    const model = await firebase.createModel(params('prefer_on_device'));
    const { response } = await model.generateContent('prompt');
    expect(log.models).toEqual([{ app: '[DEFAULT]', mode: 'prefer_on_device' }]);
    // The source is what the SDK reported.
    expect(response.inferenceSource).toBe('on_device');
    await model.generateContent('again');
    expect(log.models).toHaveLength(1);
  });

  it('PREFER_IN_CLOUD and ONLY_IN_CLOUD keep their own mode on the hybrid app; ONLY_ON_DEVICE is on the device app', async () => {
    for (const mode of ['prefer_in_cloud', 'only_in_cloud', 'only_on_device']) await (await firebase.createModel(params(mode))).generateContent('p');
    expect(log.models).toEqual([
      { app: '[DEFAULT]', mode: 'prefer_in_cloud' },
      { app: '[DEFAULT]', mode: 'only_in_cloud' },
      { app: 'silhouette-device', mode: 'only_on_device' },
    ]);
    // The device app has no App Check: a request the SDK sent on its own from it could not authenticate.
    expect(log.appChecks.filter((a) => a.app === 'silhouette-device')).toEqual([]);
  });

  it('the model download is started on the device app, without creating the hybrid app', async () => {
    const model = await firebase.createModel(params('prefer_on_device'));
    await model.initializeDeviceModel?.(() => undefined);
    expect(log.models).toEqual([{ app: 'silhouette-device', mode: 'only_on_device' }]);
    expect(log.apps).toEqual(['silhouette-device']);
  });
});

describe('App Check starts only when the SDK sends a request to the cloud', () => {
  it('a request the SDK runs on the device loads no reCAPTCHA and asks for no token', async () => {
    await (await firebase.createModel(params('prefer_on_device'))).generateContent('p');
    expect(log.appChecks).toEqual([{ app: '[DEFAULT]', provider: 'custom' }]);
    expect(log.recaptchaKeys).toEqual([]);
    expect(log.limitedUse).toEqual([]);
  });

  it('the first token Firebase AI Logic asks for (for a cloud request) starts reCAPTCHA Enterprise, one limited-use token each', async () => {
    await (await firebase.createModel(params('prefer_on_device'))).generateContent('p');
    const provider = log.providers[0];
    if (!provider) throw new Error('no App Check provider');
    const first = await provider.getToken();
    await provider.getToken();
    expect(log.appChecks).toEqual([
      { app: '[DEFAULT]', provider: 'custom' },
      { app: 'silhouette-attest', provider: 'recaptcha-enterprise' },
    ]);
    expect(log.recaptchaKeys).toEqual(['test-site-key']);
    expect(log.limitedUse).toEqual(['silhouette-attest', 'silhouette-attest']);
    expect(first.expireTimeMillis).toBe(2_000_000_000_000);
  });

  it('"Try again" after an App Check failure starts App Check again from a fresh attestation app', async () => {
    await (await firebase.createModel(params('prefer_on_device'))).generateContent('p');
    await log.providers[0]?.getToken();
    await firebase.restartForAppCheck();
    expect(log.deleted).toEqual(['[DEFAULT]', 'silhouette-attest']);
    await (await firebase.createModel(params('prefer_on_device'))).generateContent('p');
    await log.providers[1]?.getToken();
    expect(log.recaptchaKeys).toEqual(['test-site-key', 'test-site-key']);
  });

  it('reads the expiry of a token, and falls back to now for one it cannot read', () => {
    expect(firebase.expiryOf(`h.${btoa(JSON.stringify({ exp: 10 }))}.s`)).toBe(10_000);
    const now = Date.now();
    expect(firebase.expiryOf('not-a-jwt')).toBeGreaterThanOrEqual(now);
  });
});
