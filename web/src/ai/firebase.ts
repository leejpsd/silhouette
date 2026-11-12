// Firebase initialization for AI Logic. Loaded lazily the first time a model task runs, so the
// Quick Check flow never loads the Firebase SDK and keeps working offline.
// App Check: reCAPTCHA Enterprise in production (VITE_RECAPTCHA_SITE_KEY), debug provider on
// the dev server (VITE_APPCHECK_DEBUG_TOKEN from .env.local). Limited-use tokens for AI Logic.

import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { CustomProvider, ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check';
import { GoogleAIBackend, getAI, getGenerativeModel, type AI, type GenerativeModel, type HybridParams } from 'firebase/ai';
import { FIREBASE_CONFIG } from '../data/firebase-config';

export type AppCheckSetup = 'recaptcha-enterprise' | 'debug' | 'none';

interface Services {
  readonly app: FirebaseApp;
  readonly ai: AI;
  readonly appCheck: AppCheckSetup;
}

let services: Promise<Services> | null = null;

async function init(): Promise<Services> {
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
      isTokenAutoRefreshEnabled: true,
    });
    appCheck = 'recaptcha-enterprise';
  }
  const ai = getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true });
  return { app, ai, appCheck };
}

export function firebaseServices(): Promise<Services> {
  services ??= init();
  return services;
}

/** Creates a GenerativeModel. Callers keep one instance per task (configuration is fixed for its lifetime). */
export async function createModel(params: HybridParams): Promise<GenerativeModel> {
  const { ai } = await firebaseServices();
  return getGenerativeModel(ai, params);
}

/**
 * Closes the Firebase app (and with it the SDK's IndexedDB connections) so "Delete everything" can
 * remove the SDK's storage. The next model call initializes Firebase again.
 */
export async function shutdownFirebase(): Promise<void> {
  if (!services) return;
  const current = services;
  services = null;
  try {
    await deleteApp((await current).app);
  } catch {
    // Initialization had failed; nothing is open.
  }
}
