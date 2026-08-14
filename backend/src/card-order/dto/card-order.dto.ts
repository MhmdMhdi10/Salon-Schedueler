import { z } from 'zod';

export const CardOrderDto = z
  .object({
    template: z.string().trim().min(1),
    quantity: z.coerce.number().int().positive(),
    contactName: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(1),
    address: z.string().trim().min(1).max(500),
  })
  .passthrough();

export const CardOrderSalonParamDto = z
  .object({ id: z.string().trim().min(1) })
  .passthrough();
