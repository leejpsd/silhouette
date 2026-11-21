// Firebase initialization for AI Logic. Loaded lazily the first time a model task runs, so the
// Quick Check flow never loads the Firebase SDK and keeps working offline.
//
// Where a request runs is Firebase AI Logic's choice, made by the inference mode routing.json gives
// the task (createModel below): the app does not look at the device and pick a side itself.
//
// Two Firebase apps, so that work on this device makes no request at all:
// - the hybrid app carries every cloud-capable task (PREFER_ON_DEVICE, PREFER_IN_CLOUD, ONLY_IN_CLOUD),
//   one GenerativeModel per task in the task's own mode. With PREFER_ON_DEVICE the SDK runs the request
//   on Chrome's model when `LanguageModel.availability()` says "available" for the task's options and
//   sends it to the cloud otherwise, and reports which in `inferenceSource`. Its App Check is set up so
//   that nothing is fetched until the SDK is about to send a request to the cloud (`lazyAttestation`):
//   a request the SDK runs on the device loads no reCAPTCHA and asks for no token;
// - the device app has no App Check, for ONLY_ON_DEVICE tasks. Firebase AI Logic sends even an
//   ONLY_ON_DEVICE request to the cloud when the browser has no `LanguageModel` (no on-device adapter is
//   created then); the tasks stop before that (on-device.ts), and a request that slipped through would
//   carry no App Check token and be refused, besides being blocked by the network monitor.
// App Check: reCAPTCHA Enterprise in production (VITE_RECAPTCHA_SITE_KEY), the debug provider on the
// dev server (VITE_APPCHECK_DEBUG_TOKEN from .env.local). Limited-use tokens only, so App Check never
// refreshes a token on its own. The AI service reads App Check when it is created, which is why the
// hybrid app has App Check from the start and the device app none.

import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { CustomProvider, ReCaptchaEnterpriseProvider, getLimitedUseToken, initializeAppCheck, type AppCheck, type AppCheckToken } from 'firebase/app-check';
import { GoogleAIBackend, InferenceMode, getAI, getGenerativeModel, type AI, type GenerativeModel, type HybridParams } from 'firebase/ai';
import { FIREBASE_CONFIG } from '../data/firebase-config';
import { onFirstCloudRequest } from '../data/net-monitor';
import type { ModelPort } from './model-port';

export type AppCheckSetup = 'recaptcha-enterprise' | 'debug' | 'none';

interface Services {
  readonly app: FirebaseApp;
  readonly ai: AI;
  readonly appCheck: AppCheckSetup;
}

const DEVICE_APP = 'silhouette-device';
/** The app that only proves, with reCAPTCHA Enterprise, that a cloud request comes from this app. */
const ATTEST_APP = 'silhouette-attest';

let cloud: Promise<Services> | null = null;
let device: Promise<{ app: FirebaseApp; ai: AI }> | null = null;
let attest: Promise<{ app: FirebaseApp; appCheck: AppCheck }> | null = null;
let settingsListener = false;

/**
 * App Check for the hybrid app without fetching anything up front. App Check's reCAPTCHA Enterprise
 * provider loads reCAPTCHA as soon as it is initialized, before the SDK knows whether a request will run
 * on the device. So the hybrid app's provider is a CustomProvider whose token comes from an attestation
 * app with the same Firebase config (same app id, so the same kind of token): that app, and reCAPTCHA
 * with it, are created the first time Firebase AI Logic asks for a token, which it does only while it
 * builds the headers of a request it is about to send to the cloud. One limited-use token per request.
 */
function lazyAttestation(siteKey: string): CustomProvider {
  return new CustomProvider({
    getToken: async (): Promise<AppCheckToken> => {
      attest ??= Promise.resolve().then(() => {
        const app = initializeApp(FIREBASE_CONFIG, ATTEST_APP);
        return { app, appCheck: initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: false }) };
      });
      const { token } = await getLimitedUseToken((await attest).appCheck);
      return { token, expireTimeMillis: expiryOf(token) };
    },
  });
}

/** The `exp` of an App Check token (a JWT), in milliseconds; now when it cannot be read. */
export function expiryOf(token: string): number {
  try {
    const payload = JSON.parse(atob((token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now();
  } catch {
    return Date.now();
  }
}

async function initCloud(): Promise<Services> {
  const app = initializeApp(FIREBASE_CONFIG);
  let appCheck: AppCheckSetup = 'none';
  if (import.meta.env.DEV) {
    const { enableAppCheckDebugToken } = await import('./appcheck-debug');
    if (enableAppCheckDebugToken()) {
      // In debug mode the SDK exchanges the debug token when a cloud request asks for one; this
      // provider is never asked for a token.
      initializeAppCheck(app, {
        provider: new CustomProvider({ getToken: () => Promise.reject(new Error('debug provider only')) }),
        isTokenAutoRefreshEnabled: false,
      });
      appCheck = 'debug';
    }
  } else if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
    // Firebase AI Logic asks for a limited-use token per cloud request; no standing token is needed.
    initializeAppCheck(app, { provider: lazyAttestation(import.meta.env.VITE_RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: false });
    appCheck = 'recaptcha-enterprise';
  }
  const ai = getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true });
  // Settings are fetched only after a request the person chose to send has gone to the cloud: never
  // on start, and never when everything ran on this device. Once per page, even if Firebase starts again.
  if (!settingsListener) {
    settingsListener = true;
    onFirstCloudRequest(() => void cloudServices().then(({ app: current }) => import('../data/remote-config-fetch').then(({ refreshRemoteConfig }) => refreshRemoteConfig(current))));
  }
  return { app, ai, appCheck };
}

/** The hybrid app (App Check, then AI Logic), for every cloud-capable task. Created on its first request. */
export function cloudServices(): Promise<Services> {
  cloud ??= initCloud();
  return cloud;
}

/** The device app: AI Logic with no App Check, for ONLY_ON_DEVICE requests. */
function deviceServices(): Promise<{ app: FirebaseApp; ai: AI }> {
  device ??= Promise.resolve().then(() => {
    const app = initializeApp(FIREBASE_CONFIG, DEVICE_APP);
    return { app, ai: getAI(app, { backend: new GoogleAIBackend() }) };
  });
  return device;
}

/** Which Firebase app a task's model belongs to. The SDK, not this choice, decides where a request runs. */
export const appFor = (params: HybridParams): 'device' | 'hybrid' => (params.mode === InferenceMode.ONLY_ON_DEVICE ? 'device' : 'hybrid');

/**
 * A model for one task, in the task's own inference mode (routing.json), created when first used:
 * - ONLY_ON_DEVICE: on the device app;
 * - PREFER_ON_DEVICE, PREFER_IN_CLOUD, ONLY_IN_CLOUD: on the hybrid app, and Firebase AI Logic picks the
 *   device or the cloud for each request; the response's `inferenceSource` says which it was.
 * The download of the device model ("Get the on-device model") is started on the device app: it is a
 * download only and never needs App Check.
 */
export async function createModel(params: HybridParams): Promise<ModelPort> {
  let model: Promise<GenerativeModel> | null = null;
  let download: Promise<GenerativeModel> | null = null;
  const taskModel = () => (model ??= (appFor(params) === 'device' ? deviceServices() : cloudServices()).then(({ ai }) => getGenerativeModel(ai, params)));
  const downloadModel = () => (download ??= deviceServices().then(({ ai }) => getGenerativeModel(ai, { ...params, mode: InferenceMode.ONLY_ON_DEVICE })));
  return {
    async generateContent(request, options) {
      return ((await taskModel()) as unknown as ModelPort).generateContent(request, options);
    },
    async initializeDeviceModel(onDownloadProgress) {
      await (await downloadModel()).initializeDeviceModel(onDownloadProgress);
    },
  };
}

/**
 * Closes the Firebase apps (and with them the SDK's IndexedDB connections) so "Delete everything" can
 * remove the SDK's storage. The next model call initializes Firebase again.
 */
export async function shutdownFirebase(): Promise<void> {
  const open: Promise<{ app: FirebaseApp }>[] = [];
  if (cloud) open.push(cloud);
  if (device) open.push(device);
  if (attest) open.push(attest);
  cloud = null;
  device = null;
  attest = null;
  for (const s of open) {
    try {
      await deleteApp((await s).app);
    } catch {
      // Initialization had failed; nothing is open.
    }
  }
}

/**
 * After App Check could not get a token, "Try again" starts App Check again: its reCAPTCHA provider
 * throttles itself after a failure (from a second up to a day, kept in memory), so a fresh attestation
 * app is the only way to try again without reloading the page. The hybrid app starts again too, so a
 * debug-token setup is retried from the start. reCAPTCHA's invisible widget container of the old app is
 * removed so the new one can render its own.
 */
export async function restartForAppCheck(): Promise<void> {
  const current = [cloud, attest];
  cloud = null;
  attest = null;
  for (const s of current) {
    if (!s) continue;
    try {
      await deleteApp((await s).app);
    } catch {
      // Initialization had failed; nothing is open.
    }
  }
  document.getElementById(`fire_app_check_${ATTEST_APP}`)?.remove();
}
