import { controllerRouteDto, type ControllerDtoDefinition } from '../../common/dto/index.js';
import { AnyQueryDto, EmptyDto } from '../../common/dto/index.js';
import {
  EmptySubscriptionBodyDto,
  SubscriptionCallbackQueryDto,
  SubscriptionIdDto,
  SubscriptionPurchaseDto,
} from './subscription.dto.js';

const route = controllerRouteDto.bind(null, 'SubscriptionController');

export const SUBSCRIPTION_CONTROLLER_DTO_DEFINITIONS = [
  route('subscription.plans.list', 'GET', '/api/subscription/plans'),
  route('subscription.salon.read', 'GET', '/api/salons/:id/subscription', SubscriptionIdDto),
  route('subscription.purchase', 'POST', '/api/subscription/purchase', EmptyDto, AnyQueryDto, SubscriptionPurchaseDto),
  route('subscription.callback', 'GET', '/api/subscriptions/callback', EmptyDto, SubscriptionCallbackQueryDto, EmptySubscriptionBodyDto),
] as const satisfies readonly ControllerDtoDefinition[];
