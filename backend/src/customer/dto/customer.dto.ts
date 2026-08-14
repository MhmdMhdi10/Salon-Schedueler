import { z } from 'zod';
import { EmptyDto, IdParamDto } from '../../common/dto/index.js';

export const CustomerProfilePatchDto = z
  .object({ fullName: z.string().trim().min(2).max(120).optional(), phone: z.string().trim().min(1).optional() })
  .passthrough();
export const CustomerIdDto = IdParamDto;
export const EmptyCustomerBodyDto = EmptyDto;
