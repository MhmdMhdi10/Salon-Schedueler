import { z } from 'zod';
import { IdParamDto } from '../../common/dto/index.js';

export const InboxQueryDto = z
  .object({ onlyUnread: z.union([z.string(), z.boolean()]).optional(), limit: z.coerce.number().int().min(1).max(100).optional(), offset: z.coerce.number().int().min(0).optional() })
  .passthrough();
export const InboxNotificationIdDto = IdParamDto;
