import { z } from 'zod';
import { EmptyDto, IdParamDto } from '../../common/dto/index.js';

export const SubscriptionPurchaseDto = z
  .object({ salonId: z.string().trim().min(1), plan: z.enum(['monthly', 'quarterly', 'annual']) })
  .passthrough();
export const SubscriptionIdDto = IdParamDto;
export const SubscriptionCallbackQueryDto = z
  .object({
    Authority: z.string().optional(),
    authority: z.string().optional(),
    Status: z.string().optional(),
    status: z.string().optional(),
    Success: z.string().optional(),
    success: z.string().optional(),
    trackId: z.string().optional(),
    TrackId: z.string().optional(),
  })
  .passthrough();
export const EmptySubscriptionBodyDto = EmptyDto;
