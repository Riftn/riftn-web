import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Speaker from '@/components/ui/cut-icons/volume';
import { useCall } from '@/contexts/CallContext';
import { CallControl } from './CallChrome';

export function CallPlaybackControl() {
  const { t } = useTranslation();
  const { playbackDevice, setPlaybackDevice } = useCall();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // Agora supports device selection in desktop Chromium. Other browsers use the system route.
    if (!/Chrome\//.test(navigator.userAgent) || /Android|Mobile/.test(navigator.userAgent)
      || !('setSinkId' in HTMLMediaElement.prototype) || !navigator.mediaDevices?.enumerateDevices) return;
    const mediaDevices = navigator.mediaDevices;
    let active = true;
    const refresh = async () => {
      const available = await mediaDevices.enumerateDevices().catch(() => []);
      if (active) setDevices(available.filter(device =>
        device.kind === 'audiooutput' && device.deviceId && device.deviceId !== 'default' && device.label));
    };
    void refresh();
    mediaDevices.addEventListener('devicechange', refresh);
    // Permission can reveal device IDs without emitting devicechange.
    const interval = window.setInterval(refresh, 2000);
    return () => {
      active = false;
      mediaDevices.removeEventListener('devicechange', refresh);
      window.clearInterval(interval);
    };
  }, []);

  if (!devices.length) return null;
  const switchDevice = async () => {
    const index = devices.findIndex(device => device.deviceId === playbackDevice);
    const next = devices[index + 1];
    setPending(true);
    try {
      await setPlaybackDevice(next?.deviceId ?? '');
    } finally {
      setPending(false);
    }
  };

  return (
    <CallControl
      icon={Speaker}
      label={devices.find(device => device.deviceId === playbackDevice)?.label ?? t('calls.speaker')}
      active={!!playbackDevice}
      disabled={pending}
      onClick={switchDevice}
    />
  );
}
