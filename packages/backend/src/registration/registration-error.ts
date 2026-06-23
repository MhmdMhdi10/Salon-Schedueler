/**
 * Error codes for registration-related failures.
 */
export type RegistrationErrorCode = 'QR_MALFORMED' | 'QR_UNREGISTERED';

/**
 * A structured error for registration operations.
 *
 * - QR_MALFORMED: The QR payload failed structural parsing (R7.5)
 * - QR_UNREGISTERED: The QR payload parsed but the token does not match any registered salon (R7.4)
 */
export class RegistrationError extends Error {
  public readonly code: RegistrationErrorCode;

  constructor(code: RegistrationErrorCode, message?: string) {
    const defaultMessages: Record<RegistrationErrorCode, string> = {
      QR_MALFORMED: 'The scanned QR code is malformed or unreadable',
      QR_UNREGISTERED: 'The scanned QR code does not correspond to a registered salon',
    };
    super(message ?? defaultMessages[code]);
    this.name = 'RegistrationError';
    this.code = code;
  }
}
