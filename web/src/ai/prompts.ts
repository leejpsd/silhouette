// Prompts are loaded from ../shared/prompts at build time (never pasted here).
import pointerExtractV2 from '../../../shared/prompts/pointer-extract.v2.md?raw';
import photoReadV1 from '../../../shared/prompts/photo-read.v1.md?raw';

export interface PromptTemplate {
  readonly id: string;
  readonly system: string;
  readonly user: string;
}

/** Splits a prompt file into its "System instruction" text and the fenced "User content" template. */
export function parsePrompt(id: string, markdown: string): PromptTemplate {
  const section = (title: string): string => {
    const start = markdown.indexOf(`## ${title}`);
    if (start === -1) throw new Error(`${id}: missing section "${title}"`);
    const body = markdown.slice(start + title.length + 3);
    const end = body.search(/\n## /);
    return (end === -1 ? body : body.slice(0, end)).trim();
  };
  const user = /```\n([\s\S]*?)\n```/.exec(section('User content'))?.[1];
  if (user === undefined) throw new Error(`${id}: "User content" has no fenced template`);
  return { id, system: section('System instruction'), user };
}

export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
}

export const POINTER_EXTRACT = parsePrompt('pointer-extract.v2', pointerExtractV2);
export const PHOTO_READ = parsePrompt('photo-read.v1', photoReadV1);
