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
import { navigate } from '../router';
import { ScreenHeading } from '../Heading';
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

  return (
    <div className="screen doc-add">
      <ScreenHeading>{t('doc.title')}</ScreenHeading>
      <p className="lead">{t('doc.lead')}</p>

      <div className="field">
        <label htmlFor={languageId}>{t('doc.language')}</label>
        <select
          id={languageId}
          className="input"
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

      <div role="status" className="busy">
        {busy}
      </div>

      <section className="option" aria-labelledby="opt-pdf">
        <h2 id="opt-pdf">{t('doc.pdf')}</h2>
        <p className="help">{t('doc.pdf.help')}</p>
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
            {t('doc.pdf.error')}
          </p>
        )}
      </section>

      <section className="option" aria-labelledby="opt-paste">
        <h2 id="opt-paste">{t('doc.paste')}</h2>
        <label htmlFor={pasteId} className="visually-hidden">
          {t('doc.paste.label')}
        </label>
        <textarea id={pasteId} className="input textarea" rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} />
        <button
          type="button"
          className="button secondary"
          disabled={pasted.trim() === ''}
          onClick={() => acceptText(Raw.of(pasted), 'paste')}
        >
          {t('doc.paste.continue')}
        </button>
      </section>

      <section className="option" aria-labelledby="opt-photo" data-testid="photo-option" data-status={photoStatus ?? 'checking'}>
        <h2 id="opt-photo">{t('doc.photo')}</h2>
        {photoStatus === 'available' ? (
          <>
            <p className="help">{t('doc.photo.help')}</p>
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
          <p className="help">{t('doc.photo.unavailable')}</p>
        )}
        {photoError && <TaskErrorNotice error={photoError} />}
      </section>

      <section className="option" aria-labelledby="opt-manual">
        <h2 id="opt-manual">{t('doc.manual')}</h2>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            reset(true);
            update({ sourceKind: 'manual' });
            navigate({ name: 'doc-review' });
          }}
        >
          {t('doc.manual')}
        </button>
      </section>

      <section className="option samples" aria-labelledby="opt-samples">
        <h2 id="opt-samples">{t('doc.samples')}</h2>
        <p className="help">{t('doc.samples.help')}</p>
        <div className="actions">
          <button type="button" className="button secondary" disabled={busy !== null} onClick={() => void sample('en', 'pdf')}>
            {t('doc.sample.enPdf')}
          </button>
          <button type="button" className="button secondary" disabled={busy !== null} onClick={() => void sample('en', 'text')}>
            {t('doc.sample.enText')}
          </button>
          <button type="button" className="button secondary" disabled={busy !== null} onClick={() => void sample('ko', 'pdf')}>
            {t('doc.sample.koPdf')}
          </button>
          <button type="button" className="button secondary" disabled={busy !== null} onClick={() => void sample('ko', 'text')}>
            {t('doc.sample.koText')}
          </button>
        </div>
      </section>
    </div>
  );
}
