/**
 * Phone + OTP authentication screen (React Native).
 * Requirement: 1.1
 *
 * Placeholder - full React Native component implementation
 * requires react-native runtime. Contains the logic flow:
 * 1. User enters phone number
 * 2. Request OTP via authApi.requestOtp
 * 3. User enters 6-digit OTP
 * 4. Verify via authApi.verifyOtp
 * 5. Store tokens and navigate to home
 */
export const AUTH_SCREEN = 'AuthScreen';

export interface AuthScreenState {
  phone: string;
  code: string;
  step: 'phone' | 'otp';
  loading: boolean;
  error: string;
}

export const initialAuthState: AuthScreenState = {
  phone: '',
  code: '',
  step: 'phone',
  loading: false,
  error: '',
};
