import { z } from 'zod';

/**
 * Validates a service definition input.
 * - duration must be > 0 (R5.3)
 * - buffer must be >= 0 (R5.4)
 * - price must be >= 0 (R5.4)
 * - deposit (if present) must be >= 0
 */
export const ServiceInputSchema = z.object({
  salonId: z.string().uuid(),
  name: z.string().min(1),
  durationMinutes: z.number().int().positive({ message: 'Duration must be positive' }),
  bufferMinutes: z.number().int().nonnegative({ message: 'Buffer time must be non-negative' }),
  priceRial: z.number().int().nonnegative({ message: 'Price must be non-negative' }),
  requiresDeposit: z.boolean(),
  depositRial: z.number().int().nonnegative({ message: 'Deposit must be non-negative' }).optional(),
  requiredEquipmentIds: z.array(z.string().uuid()).default([]),
});

export type ServiceInput = z.infer<typeof ServiceInputSchema>;
