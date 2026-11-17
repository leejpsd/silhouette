// Firebase initialization for AI Logic. Loaded lazily the first time a model task runs, so the
// Quick Check flow never loads the Firebase SDK and keeps working offline.
//
// Two Firebase apps, so that work on this device makes no request at all:
// - the device app has no App Check. Every request that runs on the device model (ONLY_ON_DEVICE, and
//   PREFER_ON_DEVICE when the device model is available) uses a model of this app;
// - the cloud app has App Check: reCAPTCHA Enterprise in production (VITE_RECAPTCHA_SITE_KEY), the
//   debug provider on the dev server (VITE_APPCHECK_DEBUG_TOKEN from .env.local). It is created only
//   when a request is about to go to the cloud, after the person chose to send, because initializing
//   App Check loads reCAPTCHA. Limited-use tokens only, so App Check never refreshes a token on its own.
// The AI service reads App Check when it is created, which is why the two cannot share one app.

import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { CustomProvider, ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check';
import { GoogleAIBackend, InferenceMode, getAI, getGenerativeModel, type AI, type GenerativeModel, type HybridParams } from 'firebase/ai';
import { FIREBASE_CONFIG } from '../data/firebase-config';
import { onFirstCloudRequest } from '../data/net-monitor';
import { deviceAvailability, type ModelPort } from './model-port';

export type AppCheckSetup = 'recaptcha-enterprise' | 'debug' | 'none';

interface Services {
  readonly app: FirebaseApp;
  readonly ai: AI;
  readonly appCheck: AppCheckSetup;
}

const DEVICE_APP = 'silhouette-device';

let cloud: Promise<Services> | null = null;
let device: Promise<{ app: FirebaseApp; ai: AI }> | null = null;
let settingsListener = false;

async function initCloud(): Promise<Services> {
  const app = initializeApp(FIREBASE_CONFIG);
  let appCheck: AppCheckSetup = 'none';
  if (import.meta.env.DEV) {
    const { enableAppCheckDebugToken } = await import('./appcheck-debug');
    if (enableAppCheckDebugToken()) {
      // In debug mode the SDK exchanges the debug token; this provider is never asked for a token.
      initializeAppCheck(app, {
        provider: new CustomProvider({ getToken: () => Promise.reject(new Error('debug provider only')) }),
        isTokenAutoRefreshEnabled: false,
      });
      appCheck = 'debug';
    }
  } else if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
      // Firebase AI Logic asks for a limited-use token per request; no standing token is needed.
      isTokenAutoRefreshEnabled: false,
    });
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

/** The cloud app (App Check, then AI Logic). Created on the first request that goes to the cloud. */
export function cloudServices(): Promise<Services> {
  cloud ??= initCloud();
  return cloud;
}

/** The device app: AI Logic with no App Check, for requests that run on the device model. */
function deviceServices(): Promise<{ app: FirebaseApp; ai: AI }> {
  device ??= Promise.resolve().then(() => {
    const app = initializeApp(FIREBASE_CONFIG, DEVICE_APP);
    return { app, ai: getAI(app, { backend: new GoogleAIBackend() }) };
  });
  return device;
}

/** Where a request with these parameters runs, decided just before it is made. */
export async function routeOf(params: HybridParams): Promise<'device' | 'cloud'> {
  if (params.mode === InferenceMode.ONLY_ON_DEVICE) return 'device';
  if (params.mode === InferenceMode.PREFER_ON_DEVICE) {
    // Firebase AI Logic runs PREFER_ON_DEVICE on the device when the model is available for these options.
    return (await deviceAvailability(params.onDeviceParams?.createOptions)) === 'available' ? 'device' : 'cloud';
  }
  return 'cloud';
}

/**
 * A model for one task. Its requests run on a device-app model (ONLY_ON_DEVICE) when they run on the
 * device, and on a cloud-app model with the task's own mode otherwise; each is created when first used.
 */
export async function createModel(params: HybridParams): Promise<ModelPort> {
  let onDevice: Promise<GenerativeModel> | null = null;
  let inCloud: Promise<GenerativeModel> | null = null;
  const deviceModel = () => (onDevice ??= deviceServices().then(({ ai }) => getGenerativeModel(ai, { ...params, mode: InferenceMode.ONLY_ON_DEVICE })));
  const cloudModel = () => (inCloud ??= cloudServices().then(({ ai }) => getGenerativeModel(ai, params)));
  return {
    async generateContent(request, options) {
      const model = (await routeOf(params)) === 'device' ? await deviceModel() : await cloudModel();
      return (model as unknown as ModelPort).generateContent(request, options);
    },
    async initializeDeviceModel(onDownloadProgress) {
      await (await deviceModel()).initializeDeviceModel(onDownloadProgress);
    },
  };
}

/**
 * Closes both Firebase apps (and with them the SDK's IndexedDB connections) so "Delete everything" can
 * remove the SDK's storage. The next model call initializes Firebase again.
 */
export async function shutdownFirebase(): Promise<void> {
  const open: Promise<{ app: FirebaseApp }>[] = [];
  if (cloud) open.push(cloud);
  if (device) open.push(device);
  cloud = null;
  device = null;
  for (const s of open) {
    try {
      await deleteApp((await s).app);
    } catch {
      // Initialization had failed; nothing is open.
    }
  }
}

/**
 * After App Check could not get a token, "Try again" starts the cloud app again: the App Check SDK
 * throttles a provider that failed (from a second up to a day, kept in memory), so a fresh app is the
 * only way to try again without reloading the page. reCAPTCHA's invisible widget container of the old
 * app is removed so the new one can render its own.
 */
export async function restartForAppCheck(): Promise<void> {
  const current = cloud;
  cloud = null;
  if (current) {
    try {
      await deleteApp((await current).app);
    } catch {
      // Initialization had failed; nothing is open.
    }
  }
  document.getElementById('fire_app_check_[DEFAULT]')?.remove();
}
