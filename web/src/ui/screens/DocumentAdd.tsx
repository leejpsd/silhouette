// Add a document: text PDF (pdf.js on this device), paste, photo (on-device model only),
// manual entry, and sample documents. Whatever the source, the text stays Raw and becomes a
// Skeleton before anything can be sent.
import { useCallback, useEffect, useId, useState } from 'react';
import enSampleText from '../../../../shared/samples/paystub-en-01.txt?raw';
import koSampleText from '../../../../shared/samples/payslip-ko-01.txt?raw';
import w2SampleText from '../../../../shared/samples/w2-en-01.txt?raw';
import { Raw } from '../../core/types';
import { skeletonize } from '../../core/skeleton';
import { photoDeviceStatus, type DeviceStatus } from '../../ai/device-model';
import { readPhoto } from '../../ai/on-device';
import { classifyError, type TaskError } from '../../ai/errors';
import { extractPdfText } from '../../data/pdf-text';
import { useApp } from '../context';
import { UI_LOCALES, LOCALE_NAMES, isUiLocale, type Locale } from '../i18n';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import { BlockActions } from '../design/block';
import { Alert, ArrowRight, Camera, ChevronLeft, ChevronRight, Clipboard, Doc } from '../design/icons';
import { ActionLabel } from '../design/parts';
import { Loading } from '../answers/parts';
import { ModelStatus } from '../doc/ModelStatus';
import { usePaystubReadOnDevice } from '../doc/reads-on-device';
import { allowlistFor, introducersFor } from '../doc/allowlists';
import { useDocument, type SourceKind } from '../doc/state';
import { detectDocType } from '../../core/doc-type';
import { TaskErrorNotice } from '../doc/TaskErrorNotice';

type SampleButton = {
  key: string;
  lang: keyof typeof SAMPLES;
  as: 'text' | 'pdf';
  label: 'doc.sample.enText' | 'doc.sample.enPdf' | 'doc.sample.koText' | 'doc.sample.koPdf' | 'doc.sample.w2Text';
};
const SAMPLE_BUTTONS: readonly SampleButton[] = [
  { key: 'en-text', lang: 'en', as: 'text', label: 'doc.sample.enText' },
  { key: 'en-pdf', lang: 'en', as: 'pdf', label: 'doc.sample.enPdf' },
  { key: 'w2-text', lang: 'w2', as: 'text', label: 'doc.sample.w2Text' },
];

const SAMPLES = {
  en: { text: enSampleText, pdf: '/samples/paystub-en-01.pdf', language: 'en' },
  ko: { text: koSampleText, pdf: '/samples/payslip-ko-01.pdf', language: 'ko' },
  // A W-2 sample as text only (no PDF of it is bundled).
  w2: { text: w2SampleText, pdf: null, language: 'en' },
} as const;

export function DocumentAddScreen() {
  const { t } = useApp();
  const { doc, update, reset } = useDocument();
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState(false);
  const [photoError, setPhotoError] = useState<TaskError | null>(null);
  const [photoStatus, setPhotoStatus] = useState<DeviceStatus | null>(null);
  const recheckPhoto = useCallback(() => void photoDeviceStatus(doc.language).then(setPhotoStatus), [doc.language]);
  // Where a text document's silhouette is read: on this device only with a model here that reads its language.
  const { onDevice: readsHere, setStatus: setPointerStatus } = usePaystubReadOnDevice(doc.language);
  const onModelStatus = useCallback(
    (status: DeviceStatus) => {
      setPointerStatus(status);
      recheckPhoto();
    },
    [setPointerStatus, recheckPhoto],
  );
  const languageId = useId();
  const pasteId = useId();

  useEffect(() => {
    let live = true;
    void photoDeviceStatus(doc.language).then((s) => live && setPhotoStatus(s));
    return () => {
      live = false;
    };
  }, [doc.language]);

  /**
   * Every source ends here: Raw text → Skeleton + Raw map, then the preview. A text with a W-2's title at
   * the top is read as a W-2 (decided by code, core/doc-type.ts); a document of the other type than the
   * ones already confirmed starts a new set.
   */
  const acceptText = useCallback(
    (text: Raw<string>, sourceKind: SourceKind, language: Locale = doc.language) => {
      const { skeleton, map } = skeletonize(text, allowlistFor(language), introducersFor(language));
      const docType = detectDocType(text);
      const set = docType === 'w2' ? { confirmedStubs: [] } : { confirmedW2s: [] };
      update({ docType, ...set, text, skeleton, map, sourceKind, language, extraction: null, error: null, hiddenWords: [] });
      navigate({ name: 'doc-preview' });
    },
    [doc.language, update],
  );

  const fromPdf = async (data: ArrayBuffer, sourceKind: SourceKind, language: Locale = doc.language) => {
    setBusy(t('doc.reading'));
    setPdfError(false);
    try {
      const text = await extractPdfText(data);
      if (text.trim() === '') {
        setPdfError(true);
        return;
      }
      acceptText(Raw.of(text), sourceKind, language);
    } catch {
      setPdfError(true);
    } finally {
      setBusy(null);
    }
  };

  const sample = async (which: keyof typeof SAMPLES, as: 'pdf' | 'text') => {
    const s = SAMPLES[which];
    if (as === 'text' || s.pdf === null) return acceptText(Raw.of(s.text), 'sample', s.language);
    const response = await fetch(s.pdf);
    await fromPdf(await response.arrayBuffer(), 'sample', s.language);
  };

  const fromPhoto = async (file: File) => {
    setBusy(t('doc.photo.reading'));
    setPhotoError(null);
    try {
      const result = await readPhoto(Raw.of<Blob>(file), 'paystub', doc.language);
      update({ photoSource: { inferenceSource: result.inferenceSource, reason: result.reason } });
      acceptText(result.value, 'photo');
    } catch (error) {
      setPhotoError(classifyError(error));
    } finally {
      setBusy(null);
    }
  };

  const [pasteOpen, setPasteOpen] = useState(false);
  // The sample in the document's language (a Korean payslip for Korean, otherwise the English paystub).
  const main = SAMPLE_BUTTONS.find((b) => b.lang === (doc.language === 'ko' ? 'ko' : 'en') && b.as === 'text') ?? (SAMPLE_BUTTONS[0] as SampleButton);

  return (
    <div className="screen doc-add">
      <a className="text-link back-link" href={routeHref({ name: 'results' })}>
        <ChevronLeft />
        {t('detail.back')}
      </a>
      <div className="stack-8">
        <ScreenHeading size={54} wideSize={72} maxLines={3}>
          {t('doc.title')}
        </ScreenHeading>
      </div>

      <div className="field field-inline">
        <label htmlFor={languageId}>{t('doc.language')}</label>
        <select
          id={languageId}
          className="input select"
          value={doc.language}
          onChange={(e) => isUiLocale(e.target.value) && update({ language: e.target.value })}
        >
          {UI_LOCALES.map((l) => (
            <option key={l} value={l} lang={l}>
              {LOCALE_NAMES[l]}
            </option>
          ))}
        </select>
      </div>

      {busy && <Loading />}
      <div role="status" className="status-line">
        {busy}
      </div>

      {/* The four ways in, as one list: a row each, the file pickers cover their row. */}
      <div className="source-list">
      <section
        className={`source-card${photoStatus === 'available' ? '' : ' unavailable'}`}
        aria-labelledby="opt-photo"
        data-testid="photo-option"
        data-status={photoStatus ?? 'checking'}
      >
        <span className="source-icon">
          <Camera />
        </span>
        <div className="source-text">
          <h2 id="opt-photo" className="source-title">
            {t('doc.photo')}
          </h2>
          {photoStatus === 'available' ? (
            <>
              <p className="small source-sub">{t('doc.photo.short')}</p>
              <input
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                aria-labelledby="opt-photo"
                className="file"
                disabled={busy !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void fromPhoto(file);
                  e.target.value = '';
                }}
              />
            </>
          ) : (
            <>
              <p className="small source-sub" aria-hidden="true">
                {t('doc.photo.notHere')}
              </p>
              <p className="visually-hidden">{t('doc.photo.unavailable')}</p>
            </>
          )}
          {photoError && <TaskErrorNotice error={photoError} />}
        </div>
        {photoStatus === 'available' && <ChevronRight />}
      </section>

      <section className="source-card" aria-labelledby="opt-pdf">
        <span className="source-icon">
          <Doc />
        </span>
        <div className="source-text">
          <h2 id="opt-pdf" className="source-title">
            {t('doc.pdf')}
          </h2>
          <p className="small source-sub" data-testid="pdf-where">
            {t(readsHere ? 'doc.pdf.short' : 'doc.where.cloud')}
          </p>
          <input
            type="file"
            accept="application/pdf,.pdf"
            aria-labelledby="opt-pdf"
            className="file"
            disabled={busy !== null}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) await fromPdf(await file.arrayBuffer(), 'pdf');
              e.target.value = '';
            }}
          />
          {pdfError && (
            <p className="error" role="alert">
              <Alert />
              {t('doc.pdf.error')}
            </p>
          )}
        </div>
        <ChevronRight />
      </section>

      {/* Paste: the row opens to show the text box and its button. */}
      <section className="source-card source-paste" data-open={pasteOpen || pasted !== ''}>
        <button type="button" className="source-row-button" aria-expanded={pasteOpen || pasted !== ''} aria-controls={`${pasteId}-box`} onClick={() => setPasteOpen(!pasteOpen)}>
          <span className="source-icon" aria-hidden="true">
            <Clipboard />
          </span>
          <span className="source-text">
            <span className="source-title">{t('doc.paste')}</span>
            <span className="small source-sub" data-testid="paste-where">
              {t(readsHere ? 'doc.paste.short' : 'doc.where.cloud')}
            </span>
          </span>
          <ChevronRight />
        </button>
        {(pasteOpen || pasted !== '') && (
          <div className="paste-box" id={`${pasteId}-box`}>
            <label htmlFor={pasteId} className="visually-hidden">
              {t('doc.paste.label')}
            </label>
            <textarea id={pasteId} className="input textarea mono" rows={6} value={pasted} data-autofocus autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="off" onChange={(e) => setPasted(e.target.value)} />
            <button type="button" className="outline-button" disabled={pasted.trim() === ''} onClick={() => acceptText(Raw.of(pasted), 'paste')}>
              {t('doc.paste.continue')}
            </button>
          </div>
        )}
      </section>

      <button
        type="button"
        className="source-card source-button"
        onClick={() => {
          reset(true);
          update({ sourceKind: 'manual' });
          navigate({ name: 'doc-review' });
        }}
      >
        <span className="source-icon source-icon-mono" aria-hidden="true">
          123
        </span>
        <span className="source-text">
          <span className="source-title">{t('doc.manual')}</span>
          <span className="small source-sub">{t('doc.manual.short')}</span>
        </span>
        <ChevronRight />
      </button>
      </div>

      {/* When the model's state changes (a download finished), the photo row is asked again. */}
      <ModelStatus language={doc.language} onStatus={onModelStatus} />
      <p className="card-note">{t('doc.lead')}</p>

      {/* The other samples, behind one row; the one for the document's language is the main action. */}
      <details className="more-samples" data-testid="more-samples">
        <summary>
          <span className="source-icon" aria-hidden="true">
            <Doc />
          </span>
          <span className="source-text">
            <span className="source-title">{t('doc.moreSamples')}</span>
            <span className="small muted">{t('doc.samples.help')}</span>
          </span>
          <ChevronRight />
        </summary>
        <div className="sample-grid">
          {SAMPLE_BUTTONS.filter((b) => b.key !== main.key).map((b) => (
            <button key={b.key} type="button" className="outline-button" disabled={busy !== null} onClick={() => void sample(b.lang, b.as)}>
              {t(b.label)}
            </button>
          ))}
        </div>
      </details>

      <BlockActions>
        {/* The screen's main action: the quickest way to see a silhouette made. */}
        <button type="button" className="action" disabled={busy !== null} onClick={() => void sample(main.lang, main.as)}>
          <ActionLabel>{t(main.label)}</ActionLabel>
          <span className="action-arrow">
            <ArrowRight />
          </span>
        </button>
      </BlockActions>
    </div>
  );
}
