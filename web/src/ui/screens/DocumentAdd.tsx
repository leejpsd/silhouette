// Add a document: text PDF (pdf.js on this device), paste, photo (on-device model only),
// manual entry, and sample documents. Whatever the source, the text stays Raw and becomes a
// Skeleton before anything can be sent.
import { useCallback, useEffect, useId, useState } from 'react';
import enSampleText from '../../../../shared/samples/paystub-en-01.txt?raw';
import koSampleText from '../../../../shared/samples/payslip-ko-01.txt?raw';
import { Raw } from '../../core/types';
import { skeletonize } from '../../core/skeleton';
import { photoDeviceStatus, type DeviceStatus } from '../../ai/device-model';
import { readPhoto } from '../../ai/on-device';
import { classifyError, type TaskError } from '../../ai/errors';
import { extractPdfText } from '../../data/pdf-text';
import { useApp } from '../context';
import { LOCALES, LOCALE_NAMES, isLocale, type Locale } from '../i18n';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import { BlockActions } from '../design/block';
import { Alert, ArrowRight, Camera, ChevronLeft, Clipboard, Doc, Keyboard } from '../design/icons';
import { ActionLabel } from '../design/parts';
import { Loading } from '../answers/parts';
import { ModelStatus } from '../doc/ModelStatus';
import { allowlistFor, introducersFor } from '../doc/allowlists';
import { useDocument, type SourceKind } from '../doc/state';
import { TaskErrorNotice } from '../doc/TaskErrorNotice';

const SAMPLES = {
  en: { text: enSampleText, pdf: '/samples/paystub-en-01.pdf', language: 'en' },
  ko: { text: koSampleText, pdf: '/samples/payslip-ko-01.pdf', language: 'ko' },
} as const;

export function DocumentAddScreen() {
  const { t } = useApp();
  const { doc, update, reset } = useDocument();
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState(false);
  const [photoError, setPhotoError] = useState<TaskError | null>(null);
  const [photoStatus, setPhotoStatus] = useState<DeviceStatus | null>(null);
  const languageId = useId();
  const pasteId = useId();

  useEffect(() => {
    let live = true;
    void photoDeviceStatus(doc.language).then((s) => live && setPhotoStatus(s));
    return () => {
      live = false;
    };
  }, [doc.language]);

  /** Every source ends here: Raw text → Skeleton + Raw map, then the preview. */
  const acceptText = useCallback(
    (text: Raw<string>, sourceKind: SourceKind, language: Locale = doc.language) => {
      const { skeleton, map } = skeletonize(text, allowlistFor(language), introducersFor(language));
      update({ text, skeleton, map, sourceKind, language, extraction: null, error: null, hiddenWords: [] });
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
    if (as === 'text') return acceptText(Raw.of(s.text), 'sample', s.language);
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

  return (
    <div className="screen doc-add">
      <a className="text-link back-link" href={routeHref({ name: 'results' })}>
        <ChevronLeft />
        {t('detail.back')}
      </a>
      <div className="stack-8">
        <ScreenHeading size={50} maxLines={3}>
          {t('doc.title')}
        </ScreenHeading>
        <p className="lead">{t('doc.lead')}</p>
      </div>

      <div className="field">
        <label htmlFor={languageId}>{t('doc.language')}</label>
        <select
          id={languageId}
          className="input select"
          value={doc.language}
          onChange={(e) => isLocale(e.target.value) && update({ language: e.target.value })}
        >
          {LOCALES.map((l) => (
            <option key={l} value={l} lang={l}>
              {LOCALE_NAMES[l]}
            </option>
          ))}
        </select>
      </div>

      <ModelStatus language={doc.language} />

      {busy && <Loading />}
      <div role="status" className="status-line">
        {busy}
      </div>

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
              <p className="small">{t('doc.photo.help')}</p>
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
            <p className="small">{t('doc.photo.unavailable')}</p>
          )}
          {photoError && <TaskErrorNotice error={photoError} />}
        </div>
      </section>

      <section className="source-card" aria-labelledby="opt-pdf">
        <span className="source-icon">
          <Doc />
        </span>
        <div className="source-text">
          <h2 id="opt-pdf" className="source-title">
            {t('doc.pdf')}
          </h2>
          <p className="small">{t('doc.pdf.help')}</p>
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
      </section>

      <section className="source-card" aria-labelledby="opt-paste">
        <span className="source-icon">
          <Clipboard />
        </span>
        <div className="source-text">
          <h2 id="opt-paste" className="source-title">
            {t('doc.paste')}
          </h2>
          <p className="small">{t('doc.pdf.help').split('. ')[0]}.</p>
          <label htmlFor={pasteId} className="visually-hidden">
            {t('doc.paste.label')}
          </label>
          <textarea
            id={pasteId}
            className="input textarea mono"
            rows={pasteOpen || pasted !== '' ? 6 : 2}
            value={pasted}
            onFocus={() => setPasteOpen(true)}
            onChange={(e) => setPasted(e.target.value)}
          />
          <button type="button" className="outline-button" disabled={pasted.trim() === ''} onClick={() => acceptText(Raw.of(pasted), 'paste')}>
            {t('doc.paste.continue')}
          </button>
        </div>
      </section>

      <section className="source-card" aria-labelledby="opt-manual">
        <span className="source-icon">
          <Keyboard />
        </span>
        <div className="source-text">
          <h2 id="opt-manual" className="source-title">
            {t('doc.manual')}
          </h2>
          <button
            type="button"
            className="outline-button"
            onClick={() => {
              reset(true);
              update({ sourceKind: 'manual' });
              navigate({ name: 'doc-review' });
            }}
          >
            {t('doc.manual')}
          </button>
        </div>
      </section>

      <BlockActions>
        <section className="samples" aria-labelledby="opt-samples">
          <h2 id="opt-samples" className="block-title">
            {t('doc.samples')}
          </h2>
          <p className="block-note left">{t('doc.samples.help')}</p>
          {/* The screen's main action: the quickest way to see a silhouette made. */}
          <button type="button" className="action" disabled={busy !== null} onClick={() => void sample('en', 'text')}>
            <ActionLabel>{t('doc.sample.enText')}</ActionLabel>
            <span className="action-arrow">
              <ArrowRight />
            </span>
          </button>
          <div className="sample-grid">
            <button type="button" className="outline-button on-block" disabled={busy !== null} onClick={() => void sample('en', 'pdf')}>
              {t('doc.sample.enPdf')}
            </button>
            <button type="button" className="outline-button on-block" disabled={busy !== null} onClick={() => void sample('ko', 'text')}>
              {t('doc.sample.koText')}
            </button>
            <button type="button" className="outline-button on-block" disabled={busy !== null} onClick={() => void sample('ko', 'pdf')}>
              {t('doc.sample.koPdf')}
            </button>
          </div>
        </section>
      </BlockActions>
    </div>
  );
}
