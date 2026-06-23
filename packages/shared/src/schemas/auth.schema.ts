import { z } from 'zod';
import { StaffRoleSchema } from './enums.schema.js';

/** Schema for OTP request */
export const OtpRequestSchema = z.object({
  phone: z.string().regex(/^09\d{9}$/, 'Must be a valid Iranian mobile number (09XXXXXXXXX)'),
});

export type OtpRequest = z.infer<typeof OtpRequestSchema>;

/** Schema for OTP verification */
export const OtpVerifySchema = z.object({
  phone: z.string().regex(/^09\d{9}$/, 'Must be a valid Iranian mobile number (09XXXXXXXXX)'),
  code: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, 'Must be a 6-digit code'),
});

export type OtpVerify = z.infer<typeof OtpVerifySchema>;

/** Schema for creating a staff account */
export const CreateStaffAccountSchema = z.object({
  salonId: z.string().uuid(),
  phone: z.string().regex(/^09\d{9}$/, 'Must be a valid Iranian mobile number (09XXXXXXXXX)'),
  role: StaffRoleSchema,
  fullName: z.string().min(1),
});

export type CreateStaffAccount = z.infer<typeof CreateStaffAccountSchema>;
