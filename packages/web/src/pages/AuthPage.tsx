import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { authApi, setAccessToken } from '../api/client';

/**
 * Phone + OTP authentication page.
 * Requirement: 1.1, 1.2
 */
export function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestOtp = async () => {
    setLoading(true);
    setError('');
    try {
      await authApi.requestOtp(phone);
      setStep('otp');
    } catch {
      setError(t('auth.invalidOtp'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await authApi.verifyOtp(phone, code);
      setAccessToken(result.accessToken);
      localStorage.setItem('refreshToken', result.refreshToken);
      navigate('/');
    } catch {
      setError(t('auth.invalidOtp'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" data-testid="auth-page">
      <h1>{t('app.title')}</h1>
      {step === 'phone' ? (
        <form onSubmit={(e) => { e.preventDefault(); handleRequestOtp(); }}>
          <label htmlFor="phone">{t('auth.phoneLabel')}</label>
          <input
            id="phone"
            type="tel"
            placeholder={t('auth.phonePlaceholder')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            dir="ltr"
          />
          <button type="submit" disabled={loading || !phone}>
            {t('auth.requestOtp')}
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); handleVerifyOtp(); }}>
          <label htmlFor="otp">{t('auth.otpLabel')}</label>
          <input
            id="otp"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder={t('auth.otpPlaceholder')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            dir="ltr"
          />
          <button type="submit" disabled={loading || code.length !== 6}>
            {t('auth.verify')}
          </button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
