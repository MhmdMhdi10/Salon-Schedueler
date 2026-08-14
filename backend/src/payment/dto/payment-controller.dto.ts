import { controllerRouteDto, type ControllerDtoDefinition } from '../../common/dto/index.js';
import { AnyQueryDto, EmptyDto } from '../../common/dto/index.js';
import { EmptyPaymentBodyDto, InitiatePaymentDto, PaymentCallbackDto } from './payment.dto.js';

const route = controllerRouteDto.bind(null, 'PaymentController');

export const PAYMENT_CONTROLLER_DTO_DEFINITIONS = [
  route('payment.initiate', 'POST', '/api/payments/initiate', EmptyDto, AnyQueryDto, InitiatePaymentDto),
  route('payment.callback', 'POST', '/api/payments/callback', EmptyDto, AnyQueryDto, PaymentCallbackDto),
] as const satisfies readonly ControllerDtoDefinition[];
