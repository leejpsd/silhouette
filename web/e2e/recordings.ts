// The recordings the app bundles (eval/results/on-device/*.json): the baseline (the earliest run) and
// the latest run, with the figures the recording page shows, worked out from the file itself. Tests use
// these instead of a file name or numbers, so adding a newer run needs no test edit.
import { readdirSync, readFileSync } from 'node:fs';

const DIR = new URL('../eval/results/on-device/', import.meta.url);

interface RunCase {
  task: string;
  ran: string;
  final?: { incomeInputs?: { notFound: string[]; wrong: string[] }; wrongFields?: string[] };
}
interface RunFile {
  date: string;
  version: number;
  cases: RunCase[];
}

export interface Recording {
  /** The file name without `.json`: the label of its "Show the recording of …" button. */
  readonly label: string;
  readonly onDevice: number;
  readonly total: number;
  readonly readings: number;
  /** Null when the file does not record the split of the yearly-income inputs. */
  readonly income: { readonly allRight: number; readonly notFound: number; readonly wrong: number } | null;
  readonly wrongReachedPerson: number | null;
}

function figures(name: string, file: RunFile): Recording {
  const extraction = file.cases.filter((c) => c.task === 'document.pointer.extract');
  const split = extraction.every((c) => c.final?.incomeInputs !== undefined);
  return {
    label: name.replace(/\.json$/, ''),
    // Version 3 files record where each case was finally answered in `ran`; the bundled ones are version 3 or the baseline.
    onDevice: file.cases.filter((c) => c.ran === 'ON_DEVICE').length,
    total: file.cases.length,
    readings: extraction.length,
    income: split
      ? {
          allRight: extraction.filter((c) => c.final?.incomeInputs?.notFound.length === 0 && c.final.incomeInputs.wrong.length === 0).length,
          notFound: extraction.filter((c) => (c.final?.incomeInputs?.notFound.length ?? 0) > 0 && c.final?.incomeInputs?.wrong.length === 0).length,
          wrong: extraction.filter((c) => (c.final?.incomeInputs?.wrong.length ?? 0) > 0).length,
        }
      : null,
    wrongReachedPerson: extraction.every((c) => c.final?.wrongFields !== undefined) ? extraction.filter((c) => (c.final?.wrongFields?.length ?? 0) > 0).length : null,
  };
}

function bundled(): { name: string; file: RunFile }[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((name) => ({ name, file: JSON.parse(readFileSync(new URL(name, DIR), 'utf8')) as RunFile }))
    .sort((a, b) => (a.file.date < b.file.date ? -1 : 1));
}

export const bundledRecordingCount = (): number => bundled().length;
export const baselineRecording = (): Recording => {
  const first = bundled()[0];
  if (!first) throw new Error('no bundled recording');
  return figures(first.name, first.file);
};
export const latestRecording = (): Recording => {
  const last = bundled().at(-1);
  if (!last) throw new Error('no bundled recording');
  return figures(last.name, last.file);
};
