import { createContext, useContext } from 'react';
import type { ProgramVerdict } from '../core/rules';
import type { Locale, Translate } from './i18n';
import type { AnswerValue, QuickCheckAnswers, Step } from './quickcheck';

export interface AppState {
  readonly locale: Locale;
  readonly t: Translate;
  readonly steps: readonly Step[];
  readonly answers: QuickCheckAnswers;
  readonly results: readonly ProgramVerdict[];
  setAnswer(id: string, value: AnswerValue | null): void;
  resetAnswers(): void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const state = useContext(AppContext);
  if (!state) throw new Error('useApp outside AppContext');
  return state;
}
