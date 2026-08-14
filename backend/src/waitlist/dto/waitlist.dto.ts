import { z } from 'zod';
import { EmptyDto, IdParamDto } from '../../common/dto/index.js';

export const WaitlistBodyDto = z
  .object({
    serviceId: z.string().trim().min(1),
    windowStart: z.string().trim().min(1),
    windowEnd: z.string().trim().min(1),
  })
  .passthrough();
export const WaitlistIdDto = IdParamDto;
export const EmptyWaitlistBodyDto = EmptyDto;
