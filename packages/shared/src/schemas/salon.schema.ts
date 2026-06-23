import { z } from 'zod';

/** Schema for creating a salon */
export const CreateSalonSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().default('Asia/Tehran'),
});

export type CreateSalon = z.infer<typeof CreateSalonSchema>;

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
