import { forgetResultsShown } from './screens/Results';
import { forgetTravel, useDisclosures, useKeyboardFollow } from './design/motion';
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { deleteEverything, loadRecord, saveRecord, PREF_PREFIX } from '../data/store';
import { isLocale, translator, type Locale } from './i18n';
import { AppContext, type AppState } from './context';
import { BANDS, PACK, isCheckedPack, isDemoPack, isDraftPack } from './pack';
import { buildSteps, computeVerdicts, sanitizeAnswers, type AnswerValue, type QuickCheckAnswers } from './quickcheck';
import { navigate, useRoute } from './router';
import { DemoBanner, Header, LeavingBar, RailSteps } from './Chrome';
import { BlockProvider, BottomBlock, useWide, useTwoColumns } from './design/block';
import { StartScreen } from './screens/Start';
import { QuestionScreen } from './screens/Question';
import { ResultsAside, ResultsRoute } from './screens/Results';
import { ProgramScreen } from './screens/Program';
import { DocumentContext, emptyDocument, type DocumentContextValue, type DocumentState } from './doc/state';
import { clearOutbound } from '../data/outbound';
import { resetModelInstances } from '../ai/model-port';
import { resetConfig } from '../data/remote-config';
import { resetCloudRequests } from '../data/net-monitor';
import { clearSession } from './answers/session';
import { forgetReading } from './doc/last-reading';
import { forgetCounty } from './answers/county-choice';
import { LEDGER_CLEARED_KEY, startOutboundPersistence } from '../data/outbound-store';

// Screens that use models are loaded on demand (the service worker keeps them for offline use), so the
// Quick Check and its results start without the model SDK.
const DocumentAddScreen = lazy(() => import('./screens/DocumentAdd').then((m) => ({ default: m.DocumentAddScreen })));
const DocumentPreviewScreen = lazy(() => import('./screens/DocumentPreview').then((m) => ({ default: m.DocumentPreviewScreen })));
const DocumentReviewScreen = lazy(() => import('./screens/DocumentReview').then((m) => ({ default: m.DocumentReviewScreen })));
const DiscoverScreen = lazy(() => import('./answers/MoreHelp').then((m) => ({ default: m.DiscoverScreen })));
const NearbyScreen = lazy(() => import('./answers/MoreHelp').then((m) => ({ default: m.NearbyScreen })));
const DeviceCheckScreen = lazy(() => import('./screens/DeviceCheck').then((m) => ({ default: m.DeviceCheckScreen })));
const JudgesScreen = lazy(() => import('./screens/Judges').then((m) => ({ default: m.JudgesScreen })));
const TasksScreen = lazy(() => import('./screens/Tasks').then((m) => ({ default: m.TasksScreen })));

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
  const wide = useWide();
  const twoColumns = useTwoColumns();
  // A new screen starts at its top. The heading usually brings itself into view when it takes focus,
  // but a heading that stays on screen (the results list beside a program) does not, and the page
  // kept the scroll of the screen before it.
  const screenKey = route.name === 'question' || route.name === 'program' ? `${route.name}/${route.id}` : route.name;
  // Before the new screen's own effects run, so a screen that brings a part of itself into view still can.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [screenKey]);

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

  useKeyboardFollow();
  useDisclosures();

  // Outside the questions there is no direction of travel: the next question arrives without one.
  useEffect(() => {
    if (route.name !== 'question') forgetTravel();
  }, [route.name]);

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
      reset: (keepStubs) => setDoc((d) => emptyDocument(d.language, keepStubs ? d.confirmedStubs : [], keepStubs ? d.confirmedW2s : [])),
    }),
    [doc],
  );

  const t = useMemo(() => translator(locale), [locale]);
  const results = useMemo(() => computeVerdicts(PACK, BANDS, steps, answers), [steps, answers]);
  const state: AppState = { locale, t, steps, answers, results, setAnswer, resetAnswers };

  const onDelete = async () => {
    const { shutdownFirebase } = await import('../ai/firebase');
    await shutdownFirebase();
    resetModelInstances();
    (await import('../ai/tasks')).dropPreparedReadings();
    forgetReading();
    resetCloudRequests();
    clearSession();
    forgetCounty();
    forgetResultsShown();
    const report = await deleteEverything();
    resetConfig();
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
    else if (route.name === 'results') screen = <ResultsRoute />;
    else if (route.name === 'program')
      // One tree at every width: crossing the two-column width must not start the program page again
      // (an open step before sending, an answer in progress). The list is added beside it, or not.
      screen = (
        <div className={twoColumns ? 'split' : 'unsplit'}>
          {twoColumns && <ResultsAside current={route.id} />}
          <ProgramScreen key={route.id} id={route.id} />
        </div>
      );
    else if (route.name === 'doc') screen = <DocumentAddScreen />;
    else if (route.name === 'discover') screen = <DiscoverScreen />;
    else if (route.name === 'nearby') screen = <NearbyScreen />;
    else if (route.name === 'device-check') screen = <DeviceCheckScreen />;
    else if (route.name === 'judges') screen = <JudgesScreen />;
    else if (route.name === 'tasks') screen = <TasksScreen />;
    else if (route.name === 'doc-preview') screen = <DocumentPreviewScreen />;
    else if (route.name === 'doc-review') screen = <DocumentReviewScreen key={doc.extraction ? 'extracted' : 'manual'} />;
    else screen = <StartScreen notice={notice} />;
  }

  return (
    <AppContext.Provider value={state}>
      <DocumentContext.Provider value={docContext}>
      <BlockProvider>
        <a className="skip" href="#main" onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}>
          {t('app.skipToContent')}
        </a>
        <div className="app" data-route={route.name}>
          <div className="rail-top">
            <Header onLocale={changeLocale} />
            {/* Narrow: the notice under the wordmark; wide: the rail carries a short link and the notice
                stands at the top of the content. */}
            {!wide && (isDemoPack(PACK) || isDraftPack() || isCheckedPack()) && <DemoBanner onDelete={onDelete} />}
            <RailSteps route={route} />
          </div>
          <main id="main" tabIndex={-1} aria-busy={!loaded}>
            {wide && (isDemoPack(PACK) || isDraftPack() || isCheckedPack()) && <DemoBanner onDelete={onDelete} />}
            <Suspense fallback={null}>{screen}</Suspense>
          </main>
          <BottomBlock label={t('leaving.title')} count={<LeavingBar onDelete={onDelete} />} />
        </div>
      </BlockProvider>
      </DocumentContext.Provider>
    </AppContext.Provider>
  );
}
