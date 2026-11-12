// Local PDF text extraction with pdf.js (not a model). Runs entirely in the browser: the worker
// is bundled with the app, and no font or CMap data is fetched.

/** A positioned text run from pdf.js getTextContent(). */
export interface TextRun {
  readonly str: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Rebuilds lines from positioned runs: runs whose baselines are within half a line height are one
 * line; lines go top to bottom. Whitespace runs and gaps between runs become spaces, measured in
 * the page's space width (the narrowest whitespace run, else the average character width).
 */
export function linesFromRuns(runs: readonly TextRun[]): string {
  const visible = runs.filter((r) => r.str.length > 0);
  const blanks = visible.filter((r) => r.str.trim() === '' && r.width > 0).map((r) => r.width / [...r.str].length);
  const glyphs = visible.filter((r) => r.str.trim() !== '');
  const average = glyphs.reduce((a, r) => a + r.width, 0) / Math.max(1, glyphs.reduce((a, r) => a + [...r.str].length, 0));
  const space = blanks.length > 0 ? Math.min(...blanks) : average || 1;

  const lines: TextRun[][] = [];
  for (const run of [...visible].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.at(-1);
    const ref = line?.find((r) => r.height > 0) ?? line?.[0];
    if (line && ref && Math.abs(ref.y - run.y) <= Math.max(ref.height, run.height, 1) / 2) line.push(run);
    else lines.push([run]);
  }
  // Blank lines: baseline gaps measured in the page's line pitch (the smallest gap between lines).
  const baselines = lines.map((line) => (line.find((r) => r.height > 0) ?? (line[0] as TextRun)).y);
  const gaps = baselines.slice(1).map((y, i) => (baselines[i] as number) - y).filter((g) => g > 0);
  const pitch = gaps.length > 0 ? Math.min(...gaps) : 1;
  return lines
    .map((line, index) => {
      const blank = index === 0 ? 0 : Math.max(0, Math.round(((baselines[index - 1] as number) - (baselines[index] as number)) / pitch) - 1);
      line.sort((a, b) => a.x - b.x);
      let out = '';
      let end: number | null = null;
      for (const run of line) {
        if (end !== null) {
          const gap = Math.round((run.x - end) / space);
          if (gap > 0) out += ' '.repeat(gap);
        }
        out += run.str.trim() === '' ? ' '.repeat(Math.max(1, Math.round(run.width / space))) : run.str;
        end = run.x + run.width;
      }
      return '\n'.repeat(blank) + out.replace(/\s+$/, '');
    })
    .join('\n');
}

/** Extracts the text of every page, pages separated by a blank line. */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true, useSystemFonts: false });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const runs: TextRun[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        runs.push({ str: item.str, x: item.transform[4] as number, y: item.transform[5] as number, width: item.width, height: item.height || Math.abs(item.transform[3] as number) });
      }
      pages.push(linesFromRuns(runs));
    }
    return pages.join('\n\n');
  } finally {
    await task.destroy();
  }
}
