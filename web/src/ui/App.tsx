import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deleteEverything, loadRecord, saveRecord, PREF_PREFIX } from '../data/store';
import { isLocale, translator, type Locale } from './i18n';
import { AppContext, type AppState } from './context';
import { BANDS, PACK, isDemoPack } from './pack';
import { buildSteps, computeVerdicts, sanitizeAnswers, type AnswerValue, type QuickCheckAnswers } from './quickcheck';
import { navigate, useRoute } from './router';
import { DemoBanner, Footer, Header, LeavingBar } from './Chrome';
import { StartScreen } from './screens/Start';
import { QuestionScreen } from './screens/Question';
import { ResultsScreen } from './screens/Results';
import { ProgramScreen } from './screens/Program';
import { DocumentAddScreen } from './screens/DocumentAdd';
import { DocumentPreviewScreen } from './screens/DocumentPreview';
import { DocumentReviewScreen } from './screens/DocumentReview';
import { DocumentContext, emptyDocument, type DocumentContextValue, type DocumentState } from './doc/state';
import { clearOutbound } from '../data/outbound';
import { LEDGER_CLEARED_KEY, startOutboundPersistence } from '../data/outbound-store';

const ANSWERS_RECORD = 'quickcheck.answers';
const LOCALE_PREF = `${PREF_PREFIX}locale`;

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_PREF);
    if (isLocale(saved)) return saved;
  } catch {
    // Storage unavailable (private mode); fall through.
  }
  const fromBrowser = navigator.language.slice(0, 2);
  return isLocale(fromBrowser) ? fromBrowser : 'en';
}

export function App() {
  const steps = useMemo(() => buildSteps(PACK, BANDS), []);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [answers, setAnswers] = useState<QuickCheckAnswers>({});
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const route = useRoute();

  useEffect(() => {
    let live = true;
    loadRecord(ANSWERS_RECORD)
      .then((stored) => live && setAnswers(sanitizeAnswers(steps, stored)))
      .catch(() => undefined)
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [steps]);

  useEffect(() => {
    void startOutboundPersistence();
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const changeLocale = useCallback((next: Locale) => {
    setLocale(next);
    try {
      localStorage.setItem(LOCALE_PREF, next);
    } catch {
      // Preference is a convenience only.
    }
  }, []);

  // Saves happen only on explicit user answers, never from an effect, so "Delete everything"
  // is not followed by a write that would recreate the database.
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const setAnswer = useCallback((id: string, value: AnswerValue | null) => {
    const next = { ...answersRef.current, [id]: value };
    answersRef.current = next;
    setNotice(null);
    setAnswers(next);
    void saveRecord(ANSWERS_RECORD, next);
  }, []);

  const resetAnswers = useCallback(() => {
    answersRef.current = {};
    setAnswers({});
    void saveRecord(ANSWERS_RECORD, {});
  }, []);

  const [doc, setDoc] = useState<DocumentState>(() => emptyDocument(locale));
  const docContext: DocumentContextValue = useMemo(
    () => ({
      doc,
      update: (patch) => setDoc((d) => ({ ...d, ...patch })),
      reset: (keepStubs) => setDoc((d) => emptyDocument(d.language, keepStubs ? d.confirmedStubs : [])),
    }),
    [doc],
  );

  const t = useMemo(() => translator(locale), [locale]);
  const results = useMemo(() => computeVerdicts(PACK, BANDS, steps, answers), [steps, answers]);
  const state: AppState = { locale, t, steps, answers, results, setAnswer, resetAnswers };

  const onDelete = async () => {
    const { shutdownFirebase } = await import('../ai/firebase');
    const { resetModelInstances } = await import('../ai/model-port');
    await shutdownFirebase();
    resetModelInstances();
    const report = await deleteEverything();
    answersRef.current = {};
    setAnswers({});
    setDoc(emptyDocument(locale));
    const now = Date.now();
    clearOutbound(now);
    try {
      localStorage.setItem(LEDGER_CLEARED_KEY, String(now));
    } catch {
      // Without storage the bar still says so for this session.
    }
    setNotice(`${t('delete.done')} ${t('delete.erased', { count: report.databases.length })}`);
    navigate({ name: 'start' });
  };

  let screen = null;
  if (loaded) {
    if (route.name === 'question') screen = <QuestionScreen key={route.id} route={route} />;
    else if (route.name === 'results') screen = <ResultsScreen />;
    else if (route.name === 'program') screen = <ProgramScreen key={route.id} id={route.id} />;
    else if (route.name === 'doc') screen = <DocumentAddScreen />;
    else if (route.name === 'doc-preview') screen = <DocumentPreviewScreen />;
    else if (route.name === 'doc-review') screen = <DocumentReviewScreen key={doc.extraction ? 'extracted' : 'manual'} />;
    else screen = <StartScreen notice={notice} />;
  }

  return (
    <AppContext.Provider value={state}>
      <DocumentContext.Provider value={docContext}>
      <a className="skip" href="#main" onClick={(e) => {
        e.preventDefault();
        document.getElementById('main')?.focus();
      }}>
        {t('app.skipToContent')}
      </a>
      <Header onLocale={changeLocale} />
      {isDemoPack(PACK) && <DemoBanner compact={route.name !== 'start'} />}
      <main id="main" tabIndex={-1} aria-busy={!loaded}>
        {screen}
      </main>
      <Footer onDelete={onDelete} />
      <LeavingBar />
      </DocumentContext.Provider>
    </AppContext.Provider>
  );
}
