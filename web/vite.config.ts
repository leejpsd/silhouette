import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { makeTextPdf } from './scripts/text-pdf.mjs';

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

/** Emits /sw.js with the precache list of every file in the build (bundle + public/). */
function serviceWorker(): Plugin {
  return {
    name: 'silhouette-service-worker',
    apply: 'build',
    // After vite:build-html, so index.html is in the bundle.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const publicFiles = readdirSync(here('./public'), { recursive: true, encoding: 'utf8' }).filter((f) => !f.startsWith('.'));
      const files = [...Object.keys(bundle), ...publicFiles].filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
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

export default defineConfig({
  plugins: [react(), samplePdfs(), serviceWorker()],
  server: {
    // Contracts are imported from ../shared at build time.
    fs: { allow: ['..'] },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'eval/**/*.test.mjs'],
  },
});
