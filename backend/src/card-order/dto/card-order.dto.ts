import { z } from 'zod';

export const CardOrderDto = z
  .object({
    template: z.enum(['card', 'banner']),
    accent: z.string().trim().max(40).optional(),
    quantity: z.coerce.number().int().positive(),
    contactName: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(1),
    province: z.string().trim().min(1).max(80),
    city: z.string().trim().min(1).max(80),
    address: z.string().trim().min(1).max(500),
    postalCode: z.string().trim().min(1).max(20),
    notes: z.string().trim().max(1000).optional(),
    printSpecs: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const CardOrderSalonParamDto = z
  .object({ id: z.string().trim().min(1) })
  .passthrough();
