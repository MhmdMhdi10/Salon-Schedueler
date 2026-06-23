/**
 * Pure flow logic for the mobile QR scan screen.
 *
 * Resolves a scanned salon QR payload via the API client and maps the two
 * failure conditions to distinct outcomes (malformed token vs unregistered
 * salon) so the screen can show distinct messages. Never throws.
 *
 * Requirement: 7.4, 7.5 (orig R7)
 */
import { salonApi } from '../api/client';

export interface ResolvedSalon {
  id: string;
  name: string;
}

export type QrResolution =
  | { ok: true; salon: ResolvedSalon }
  | { ok: false; kind: 'malformed' | 'unregistered' | 'error'; message: string };

function codeOf(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code: unknown }).code);
  }
  return '';
}

function messageOf(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  return 'خطای ناشناخته';
}

/**
 * Resolve a scanned salon QR payload. Distinguishes a malformed payload
 * (`QR_MALFORMED`) from an unregistered salon (`QR_UNREGISTERED`).
 */
export async function resolveScannedQr(payload: string): Promise<QrResolution> {
  try {
    const res = await salonApi.resolveQr(payload);
    return { ok: true, salon: res.salon };
  } catch (err) {
    const code = codeOf(err);
    if (code === 'QR_MALFORMED') {
      return { ok: false, kind: 'malformed', message: 'کد QR نامعتبر است' };
    }
    if (code === 'QR_UNREGISTERED') {
      return { ok: false, kind: 'unregistered', message: 'سالن یافت نشد' };
    }
    return { ok: false, kind: 'error', message: messageOf(err) };
  }
}
