import { controllerRouteDto, type ControllerDtoDefinition } from '../../common/dto/index.js';
import { TransactionSalonParamDto } from './transaction.dto.js';

const route = controllerRouteDto.bind(null, 'TransactionController');

export const TRANSACTION_CONTROLLER_DTO_DEFINITIONS = [
  route('transaction.salon.list', 'GET', '/api/salons/:id/transactions', TransactionSalonParamDto),
] as const satisfies readonly ControllerDtoDefinition[];
