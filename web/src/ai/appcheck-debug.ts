// Dev server only. Imported dynamically behind `import.meta.env.DEV`, so production builds never
// contain this module or the token.
// The token comes from web/.env.local (gitignored) and is never logged.
export function enableAppCheckDebugToken(): boolean {
  const token = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  if (!token) return false;
  (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = token;
  return true;
}
