import { z } from 'zod';
import { EmptyDto, IdParamDto } from '../../common/dto/index.js';

const locationType = z.enum(['salon', 'customer']);

export const SalonIdDto = IdParamDto;
export const SalonQrParamDto = z.object({ payload: z.string().trim().min(1) }).passthrough();
export const SalonAvailabilityQueryDto = z
  .object({
    serviceId: z.string().trim().min(1),
    date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    staffId: z.string().trim().min(1).optional(),
    locationType: locationType.optional(),
  })
  .passthrough();
export const SalonScanQueryDto = z
  .object({ utm_source: z.string().optional(), source: z.string().optional() })
  .passthrough();
export const SalonScanBodyDto = SalonScanQueryDto;
export const SalonEmptyBodyDto = EmptyDto;

export type SalonAvailabilityQuery = z.infer<typeof SalonAvailabilityQueryDto>;
