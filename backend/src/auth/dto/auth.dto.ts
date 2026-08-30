import { z } from 'zod';
// Auth service accepts the normalized Iranian `09...` form and the `+98...`
// form used by existing clients/tests. Normalization/phone policy remains in
// AuthService; transport DTO only guarantees presence and numeric OTP shape.
export const AuthRequestDto = z
  .object({ phone: z.string().trim().min(1) })
  .passthrough();
export const AuthVerifyDto = z
  .object({
    phone: z.string().trim().min(1),
    // Local OTPs are six digits; provider-generated OTPs may be up to ten
    // digits (Melli Payamak's endpoint returns the exact code it sent).
    code: z.string().min(4).max(10).regex(/^\d+$/),
  })
  .passthrough();
// Browser refresh uses the HttpOnly cookie; native clients send the token body.
// Presence is enforced by the controller after it selects the client mode.
export const AuthRefreshDto = z
  .object({ refreshToken: z.string().trim().min(1).optional() })
  .passthrough();
/** Selects one salon membership for a phone that belongs to several salons. */
export const AuthContextDto = z
  .object({ staffMemberId: z.string().uuid() })
  .passthrough();

export type AuthRequestInput = z.infer<typeof AuthRequestDto>;
export type AuthVerifyInput = z.infer<typeof AuthVerifyDto>;
export type AuthRefreshInput = z.infer<typeof AuthRefreshDto>;
export type AuthContextInput = z.infer<typeof AuthContextDto>;
