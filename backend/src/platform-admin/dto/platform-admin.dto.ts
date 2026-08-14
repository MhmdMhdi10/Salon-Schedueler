import { z } from 'zod';
import { IdParamDto } from '../../common/dto/index.js';

export const PlatformAdminQueryDto = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    search: z.string().optional(),
    status: z.string().optional(),
    salonId: z.string().optional(),
    source: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .passthrough();
export const PlatformAdminIdDto = IdParamDto;
export const PlatformAdminDetailParamDto = z.object({ resource: z.string().trim().min(1), id: z.string().trim().min(1) }).passthrough();
export const PlatformAdminStatusDto = z.object({ active: z.boolean() }).passthrough();
export const PlatformAdminAppointmentActionDto = z.object({ action: z.enum(['approve', 'reject', 'cancel', 'no_show', 'complete']) }).passthrough();
