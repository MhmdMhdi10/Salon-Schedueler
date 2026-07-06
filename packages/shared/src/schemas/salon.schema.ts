import { z } from 'zod';

/** Schema for creating a salon */
export const CreateSalonSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().default('Asia/Tehran'),
});

export type CreateSalon = z.infer<typeof CreateSalonSchema>;

/** Iranian mobile number pattern (Latin digits, normalized before validation). */
const IRANIAN_MOBILE = /^09\d{9}$/;

/**
 * A single service captured during salon self-registration (the onboarding
 * questionnaire). Durations/prices arrive as numbers (the web normalizes any
 * Persian digits to Latin before submit). Kept lean on purpose — buffer,
 * deposit and equipment are configured later in the panel.
 *
 * `durationMinutes` and `priceRial` are OPTIONAL so an owner can quickly add a
 * service by name alone during onboarding and fill in the details later in the
 * panel. They default to 30 minutes / 0 Rial respectively.
 */
export const RegisterSalonServiceSchema = z.object({
  name: z.string().min(1).max(120),
  durationMinutes: z.number().int().positive().max(24 * 60).default(30),
  priceRial: z.number().int().nonnegative().default(0),
});

export type RegisterSalonService = z.infer<typeof RegisterSalonServiceSchema>;

/**
 * Salon self-registration payload (public, unauthenticated). Creates the salon,
 * its Owner staff member (logging in with `phone` mints an Owner token), starts
 * the free trial, and provisions the optional onboarding answers (services,
 * chairs, brand accent) so the panel is pre-filled.
 *
 * Every onboarding answer beyond the three identity fields is OPTIONAL so the
 * questionnaire can be skipped: `salonName`, `ownerName` and `phone` are the
 * only required inputs.
 */
export const RegisterSalonSchema = z.object({
  /** Salon display name (required). */
  salonName: z.string().min(1).max(120),
  /** Owner's full name — becomes the Owner staff member (required). */
  ownerName: z.string().min(1).max(120),
  /** Owner login phone (Iranian mobile, normalized to Latin digits; required). */
  phone: z.string().regex(IRANIAN_MOBILE),
  /** IANA timezone; defaults to Tehran. */
  timezone: z.string().default('Asia/Tehran'),
  /** Optional storefront brand-accent key (skippable). */
  brandAccent: z.string().max(40).optional(),
  /** Optional services to pre-create (skippable). */
  services: z.array(RegisterSalonServiceSchema).max(50).default([]),
  /** Optional number of chairs to pre-create, named «صندلی N» (skippable). */
  chairCount: z.number().int().min(0).max(50).default(0),
});

export type RegisterSalon = z.infer<typeof RegisterSalonSchema>;

/** Schema for registering a staff member */
export const RegisterStaffMemberSchema = z.object({
  salonId: z.string().uuid(),
  fullName: z.string().min(1),
  role: z.enum(['Owner', 'Admin', 'Stylist']),
});

export type RegisterStaffMember = z.infer<typeof RegisterStaffMemberSchema>;

/** Schema for registering a chair */
export const RegisterChairSchema = z.object({
  salonId: z.string().uuid(),
  name: z.string().min(1),
});

export type RegisterChair = z.infer<typeof RegisterChairSchema>;

/** Schema for configuring working hours */
export const WorkingHoursInputSchema = z.object({
  ownerKind: z.enum(['staff', 'chair']),
  ownerId: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format'),
});

export type WorkingHoursInput = z.infer<typeof WorkingHoursInputSchema>;

/** Schema for adding a holiday */
export const HolidayInputSchema = z.object({
  salonId: z.string().uuid(),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be ISO date format YYYY-MM-DD'),
});

export type HolidayInput = z.infer<typeof HolidayInputSchema>;
