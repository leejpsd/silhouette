// On-device model status (unavailable / downloadable / downloading with progress / available).
// The download starts only from the button (a user gesture).
import { useEffect, useState } from 'react';
import { ON_DEVICE_LANGUAGES } from '../../ai/tasks';
import { downloadDeviceModel, pointerDeviceStatus, type DeviceStatus } from '../../ai/device-model';
import { useApp } from '../context';

export function ModelStatus({ language, onStatus }: { language: string; onStatus?: (status: DeviceStatus) => void }) {
  const { t } = useApp();
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const supported = ON_DEVICE_LANGUAGES.has(language);

  useEffect(() => {
    let live = true;
    void pointerDeviceStatus('paystub', language).then((s) => {
      if (!live) return;
      setStatus(s);
      onStatus?.(s);
    });
    return () => {
      live = false;
    };
  }, [language, onStatus]);

  const download = async () => {
    setFailed(false);
    setStatus('downloading');
    try {
      await downloadDeviceModel('paystub', language, (fraction) => setProgress(fraction));
      const next = await pointerDeviceStatus('paystub', language);
      setStatus(next);
      onStatus?.(next);
    } catch {
      setFailed(true);
      setStatus(await pointerDeviceStatus('paystub', language));
    }
  };

  if (status === null) return null;
  const percent = Math.round(progress * 100);
  return (
    <section className="model-status" aria-labelledby="model-status-title" data-testid="model-status" data-status={status}>
      <h2 id="model-status-title">{t('model.title')}</h2>
      {!supported && <p>{t('model.languageUnsupported')}</p>}
      {supported && status === 'available' && <p>{t('model.available')}</p>}
      {supported && status === 'unavailable' && <p>{t('model.unavailable')}</p>}
      {supported && status === 'downloadable' && (
        <>
          <p>{t('model.downloadable')}</p>
          <button type="button" className="button secondary" onClick={() => void download()}>
            {t('model.download')}
          </button>
        </>
      )}
      {supported && status === 'downloading' && (
        <div className="progress-block">
          <label htmlFor="model-progress">{t('model.downloading', { percent })}</label>
          <progress id="model-progress" max={100} value={percent} />
        </div>
      )}
      {failed && <p role="alert">{t('model.downloadFailed')}</p>}
    </section>
  );
}
