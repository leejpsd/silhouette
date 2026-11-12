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
