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
  durationMode: z.enum(['fixed', 'variable']).optional(),
  minDurationMinutes: z.number().int().positive().optional(),
  maxDurationMinutes: z.number().int().positive().optional(),
  bufferMinutes: z.number().int().nonnegative({ message: 'Buffer time must be non-negative' }),
  priceRial: z.number().int().nonnegative({ message: 'Price must be non-negative' }),
  requiresDeposit: z.boolean(),
  depositRial: z.number().int().nonnegative({ message: 'Deposit must be non-negative' }).optional(),
  depositType: z.enum(['fixed', 'percentage']).optional(),
  depositPercent: z.number().int().min(1).max(100).optional(),
  approvalStaffId: z.string().uuid().nullable().optional(),
  requiredEquipmentIds: z.array(z.string().uuid()).default([]),
}).superRefine((value, ctx) => {
  if (value.durationMode === 'variable') {
    const min = value.minDurationMinutes ?? value.durationMinutes;
    const max = value.maxDurationMinutes ?? min;
    if (max < min) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxDurationMinutes'],
        message: 'Maximum duration must be at least the minimum',
      });
    }
  }
  if (value.requiresDeposit && value.depositType === 'percentage' && value.depositPercent == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['depositPercent'],
      message: 'Deposit percentage is required',
    });
  }
});

export type ServiceInput = z.infer<typeof ServiceInputSchema>;
