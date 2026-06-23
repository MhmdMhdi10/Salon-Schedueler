import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Button, ActivityIndicator } from 'react-native';
import { resolveScannedQr, ResolvedSalon } from './QrScanScreen.logic';

/**
 * Camera QR scan screen (React Native).
 *
 * The device camera is abstracted behind the `onScan` prop: a real camera
 * component wires the provided handler and invokes it with each decoded
 * payload (tests/hosts can drive it without a camera). On a successful
 * resolve the screen invokes `onResolved` to navigate; on failure it shows
 * distinct messages for a malformed payload versus an unregistered salon.
 *
 * Requirement: 7.4, 7.5 (orig R7)
 */

/** Navigation route name for the QR scan screen. */
export const QR_SCAN_SCREEN = 'QrScanScreen';

type ScanStatus = 'idle' | 'resolving' | 'resolved' | 'error';

export interface QrScanScreenProps {
  /**
   * Camera abstraction. Receives a callback that should be invoked with each
   * decoded QR payload.
   */
  onScan?: (handlePayload: (payload: string) => void) => void;
  /** Success navigation callback, invoked with the resolved salon. */
  onResolved?: (salon: ResolvedSalon) => void;
}

export function QrScanScreen({ onScan, onResolved }: QrScanScreenProps) {
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [message, setMessage] = useState('');
  const [salonName, setSalonName] = useState('');

  const handlePayload = useCallback(
    async (payload: string) => {
      setStatus('resolving');
      setMessage('');
      const result = await resolveScannedQr(payload);
      if (result.ok) {
        setSalonName(result.salon.name);
        setStatus('resolved');
        onResolved?.(result.salon);
      } else {
        setStatus('error');
        setMessage(result.message);
      }
    },
    [onResolved]
  );

  useEffect(() => {
    onScan?.(handlePayload);
  }, [onScan, handlePayload]);

  return (
    <View testID="qr-scan-screen">
      <Text>اسکن QR سالن</Text>
      {status === 'resolving' ? <ActivityIndicator testID="qr-loading" /> : null}
      {status === 'error' ? <Text testID="qr-error">{message}</Text> : null}
      {status === 'resolved' ? <Text testID="qr-success">{salonName}</Text> : null}
      <Button title="اسکن مجدد" onPress={() => setStatus('idle')} />
    </View>
  );
}

export default QrScanScreen;
