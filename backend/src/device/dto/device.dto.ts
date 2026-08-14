import { z } from 'zod';

export const RegisterDeviceDto = z.object({ token: z.string().trim().min(1), platform: z.string().trim().min(1) }).passthrough();
