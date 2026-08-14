import { z } from 'zod';
import { IdParamDto } from '../../common/dto/index.js';

export const ReferralClaimParamDto = z.object({ token: z.string().trim().min(1) }).passthrough();
export const CreateReferralDto = z
  .object({ salonName: z.string().trim().min(1), city: z.string().trim().min(1), salonPhone: z.string().optional(), salonInstagram: z.string().optional() })
  .passthrough();
export const ReferralIdDto = IdParamDto;
