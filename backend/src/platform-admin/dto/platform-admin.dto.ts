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
export const PlatformCardOrderUpdateDto = z
  .object({
    status: z.enum(['received', 'contacted', 'in_print', 'shipped', 'completed', 'cancelled']),
    note: z.string().trim().max(1000).optional(),
  })
  .passthrough();
export const PlatformSupportTicketUpdateDto = z
  .object({
    status: z.enum(['open', 'triaged', 'in_progress', 'resolved', 'closed']).optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    resolution: z.string().trim().max(2000).optional(),
    assignedAdminId: z.string().uuid().nullable().optional(),
  })
  .passthrough();
