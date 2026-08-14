import { z } from 'zod';

export const BotSecretParamDto = z.object({ secret: z.string().trim().min(1) }).passthrough();
export const BotUpdateDto = z.record(z.unknown());
