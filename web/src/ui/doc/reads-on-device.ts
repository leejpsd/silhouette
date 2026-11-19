// Whether a paystub in `language` is read on this device first: the on-device model is ready and reads
// that language (the same rule as the silhouette preview). Until that is known the answer is no, so no
// line promises a reading on this device that will not happen.
import { useEffect, useState } from 'react';
import { pointerDeviceStatus, type DeviceStatus } from '../../ai/device-model';
import { ON_DEVICE_LANGUAGES } from '../../ai/tasks';

export function usePaystubReadOnDevice(language: string): { onDevice: boolean; setStatus: (status: DeviceStatus) => void } {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  useEffect(() => {
    let live = true;
    void pointerDeviceStatus('paystub', language).then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, [language]);
  return { onDevice: status === 'available' && ON_DEVICE_LANGUAGES.has(language), setStatus };
}
