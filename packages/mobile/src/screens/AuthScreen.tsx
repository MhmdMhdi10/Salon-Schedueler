import React, { useState } from 'react';
import { View, Text, TextInput, Button, ActivityIndicator } from 'react-native';
import { requestOtp, verifyOtp, PersistTokens } from './AuthScreen.logic';

/**
 * Phone + OTP authentication screen (React Native).
 *
 * Flow: enter phone -> request OTP -> enter 6-digit code -> verify -> store
 * tokens via the API client -> navigate onward. Surfaces loading, success
 * (via `onAuthenticated`), and error states.
 *
 * Requirement: 7.4, 7.5 (orig R1)
 */

/** Navigation route name for the auth screen. */
export const AUTH_SCREEN = 'AuthScreen';

export type AuthStep = 'phone' | 'otp';

export interface AuthScreenProps {
  /** Invoked after tokens are stored, so the host can navigate onward. */
  onAuthenticated?: () => void;
  /** Optional token persistence (e.g. secure storage / AsyncStorage). */
  persistTokens?: PersistTokens;
}

export function AuthScreen({ onAuthenticated, persistTokens }: AuthScreenProps) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<AuthStep>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRequestOtp = async () => {
    setLoading(true);
    setError('');
    const result = await requestOtp(phone);
    setLoading(false);
    if (result.ok) {
      setStep('otp');
    } else {
      setError(result.error);
    }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    setError('');
    const result = await verifyOtp(phone, code, persistTokens);
    setLoading(false);
    if (result.ok) {
      onAuthenticated?.();
    } else {
      setError(result.error);
    }
  };

  return (
    <View testID="auth-screen">
      <Text>سامانه رزرو سالن</Text>
      {step === 'phone' ? (
        <View>
          <Text>شماره موبایل</Text>
          <TextInput
            testID="phone-input"
            value={phone}
            onChangeText={setPhone}
            placeholder="09xxxxxxxxx"
            keyboardType="phone-pad"
          />
          <Button
            title="دریافت کد"
            onPress={handleRequestOtp}
            disabled={loading || phone.length === 0}
          />
        </View>
      ) : (
        <View>
          <Text>کد تایید</Text>
          <TextInput
            testID="otp-input"
            value={code}
            onChangeText={setCode}
            placeholder="کد ۶ رقمی"
            keyboardType="number-pad"
            maxLength={6}
          />
          <Button
            title="تایید"
            onPress={handleVerifyOtp}
            disabled={loading || code.length !== 6}
          />
        </View>
      )}
      {loading ? <ActivityIndicator testID="auth-loading" /> : null}
      {error.length > 0 ? <Text testID="auth-error">{error}</Text> : null}
    </View>
  );
}

export default AuthScreen;
