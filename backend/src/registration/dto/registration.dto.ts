import { z } from 'zod';
import { RegisterSalonSchema } from '@salon/shared';

export const RegisterSalonDto = RegisterSalonSchema.passthrough();
export const CheckPhoneQueryDto = z.object({ phone: z.string().trim().min(1) }).passthrough();

export type RegisterSalonInput = z.infer<typeof RegisterSalonDto>;
export type CheckPhoneQuery = z.infer<typeof CheckPhoneQueryDto>;
