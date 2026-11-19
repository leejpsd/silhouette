import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { makeTextPdf } from './scripts/text-pdf.mjs';

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

/** Files fetched only when asked for: the cloud evaluation file (432 KB) behind "Recount from the file". */
const NOT_PRECACHED = /^assets\/v15p4-[^/]*\.json$/;

/** Emits /sw.js with the precache list of every file in the build (bundle + public/). */
function serviceWorker(): Plugin {
  return {
    name: 'silhouette-service-worker',
    apply: 'build',
    // After vite:build-html, so index.html is in the bundle.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const publicFiles = readdirSync(here('./public'), { recursive: true, withFileTypes: true })
        .filter((d) => d.isFile() && !d.name.startsWith('.'))
        .map((d) => `${d.parentPath.slice(here('./public').length).replace(/^\/+/, '')}${d.parentPath.length > here('./public').length ? '/' : ''}${d.name}`);
      const files = [...Object.keys(bundle), ...publicFiles].filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !NOT_PRECACHED.test(f));
      const hash = createHash('sha256');
      for (const name of [...files].sort()) {
        hash.update(name);
        const chunk = bundle[name];
        if (chunk) hash.update(chunk.type === 'chunk' ? chunk.code : typeof chunk.source === 'string' ? chunk.source : Buffer.from(chunk.source));
        else hash.update(readFileSync(here(`./public/${name}`)));
      }
      if (!files.includes('index.html')) this.error('service worker: index.html missing from the bundle');
      const precache = ['/', ...files.map((f) => `/${f}`)];
      const source = readFileSync(here('./sw/sw.template.js'), 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 16))
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

/** Sample documents for sample mode: shared/samples/*.txt rendered as text PDFs (never copied). */
const SAMPLES = ['paystub-en-01', 'payslip-ko-01'];

function samplePdfs(): Plugin {
  const pdf = (name: string) => makeTextPdf(readFileSync(here(`../shared/samples/${name}.txt`), 'utf8'));
  return {
    name: 'silhouette-sample-pdfs',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/samples\/([a-z0-9-]+)\.pdf$/.exec(req.url ?? '');
        if (!m || !SAMPLES.includes(m[1] as string)) return next();
        res.setHeader('Content-Type', 'application/pdf');
        res.end(Buffer.from(pdf(m[1] as string)));
      });
    },
    generateBundle() {
      for (const name of SAMPLES) this.emitFile({ type: 'asset', fileName: `samples/${name}.pdf`, source: pdf(name) });
    },
  };
}

/**
 * The ground colour of both themes, from the design tokens, in the document head: the page paints in
 * its own colour before any script runs (no white flash before the dark theme).
 */
function groundInHead(): Plugin {
  return {
    name: 'ground-in-head',
    transformIndexHtml(html) {
      const tokens = JSON.parse(readFileSync(new URL('../shared/design/tokens.json', import.meta.url), 'utf8')) as {
        color: { light: { ground: string }; dark: { ground: string } };
      };
      const css = `html{color-scheme:light dark;background:${tokens.color.light.ground}}@media (prefers-color-scheme: dark){html{background:${tokens.color.dark.ground}}}`;
      return html.replace('</title>', `</title>\n    <style>${css}</style>`);
    },
  };
}

/**
 * `npm run build:hosting` builds in mode `hosting`: the build for Firebase Hosting. It needs the
 * reCAPTCHA Enterprise site key for production App Check, from the environment or a git-ignored
 * `.env.hosting.local`, and stops with a clear message without it.
 */
function requireSiteKey(mode: string): void {
  if (mode !== 'hosting') return;
  const key = loadEnv(mode, here('.'), 'VITE_')['VITE_RECAPTCHA_SITE_KEY'];
  if (!key) {
    throw new Error(
      'build:hosting needs VITE_RECAPTCHA_SITE_KEY (the reCAPTCHA Enterprise site key registered for App Check). ' +
        'Set it in the environment or in web/.env.hosting.local, which is not committed.',
    );
  }
}

/**
 * The rule pack the app is built with. People get the California pack; the invented `zz-test` pack is
 * built only for the unit tests (mode `test`) and for the end-to-end suite that exercises every screen
 * against it (mode `demo-pack`, `npm run build:demo-pack`). It is never part of a shipped build.
 */
export function packFor(mode: string): string {
  return mode === 'test' || mode === 'demo-pack' ? 'zz-test' : 'us-ca';
}

export default defineConfig(({ mode }) => {
  requireSiteKey(mode);
  const pack = packFor(mode);
  return {
  resolve: {
    alias: {
      '@pack': here(`../shared/rulepacks/${pack}`),
      '@bands': here(`../shared/bands/${pack}.json`),
    },
  },
  plugins: [react(), samplePdfs(), serviceWorker(), groundInHead()],
  // For the on-device check's run file (device block): the app's and the Firebase JS SDK's versions.
  define: {
    __APP_VERSION__: JSON.stringify((JSON.parse(readFileSync(here('./package.json'), 'utf8')) as { version: string }).version),
    __FIREBASE_SDK_VERSION__: JSON.stringify((JSON.parse(readFileSync(here('./node_modules/firebase/package.json'), 'utf8')) as { version: string }).version),
  },
  server: {
    // Contracts are imported from ../shared at build time.
    fs: { allow: ['..'] },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'eval/**/*.test.mjs', 'scripts/**/*.test.mjs', 'sw/**/*.test.mjs'],
  },
  };
});
