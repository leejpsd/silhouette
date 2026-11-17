/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** reCAPTCHA Enterprise site key for App Check in production (not yet issued). */
  readonly VITE_RECAPTCHA_SITE_KEY?: string;
  /** App Check debug token, dev server only, from web/.env.local (gitignored). Never logged. */
  readonly VITE_APPCHECK_DEBUG_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The app's version (web/package.json), for the on-device check's run file. */
declare const __APP_VERSION__: string;
/** The Firebase JS SDK's version (Firebase AI Logic), for the on-device check's run file. */
declare const __FIREBASE_SDK_VERSION__: string;
