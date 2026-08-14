import { z } from 'zod';
import { EmptyDto } from '../../common/dto/index.js';

export const InitiatePaymentDto = z.object({ appointmentId: z.string().trim().min(1) }).passthrough();
export const PaymentCallbackDto = z.record(z.unknown());
export const EmptyPaymentBodyDto = EmptyDto;
