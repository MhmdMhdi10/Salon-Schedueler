import { z } from 'zod';
import { AppointmentSourceSchema } from './enums.schema.js';

/** Schema for a booking request */
export const BookingRequestSchema = z.object({
  salonId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startAt: z.string().datetime(),
  customerId: z.string().uuid(),
  preferredStaffId: z.string().uuid().optional(),
  source: AppointmentSourceSchema,
});

export type BookingRequest = z.infer<typeof BookingRequestSchema>;

/** Schema for an availability query */
export const AvailabilityQuerySchema = z.object({
  salonId: z.string().uuid(),
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be ISO date format YYYY-MM-DD'),
  granularityMinutes: z.number().int().positive().default(15),
});

export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;
