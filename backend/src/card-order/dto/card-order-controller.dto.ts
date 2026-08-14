import { controllerRouteDto, type ControllerDtoDefinition } from '../../common/dto/index.js';
import { AnyQueryDto } from '../../common/dto/index.js';
import { CardOrderDto, CardOrderSalonParamDto } from './card-order.dto.js';

const route = controllerRouteDto.bind(null, 'CardOrderController');

export const CARD_ORDER_CONTROLLER_DTO_DEFINITIONS = [
  route('card-order.create', 'POST', '/api/salons/:id/card-orders', CardOrderSalonParamDto, AnyQueryDto, CardOrderDto),
] as const satisfies readonly ControllerDtoDefinition[];
