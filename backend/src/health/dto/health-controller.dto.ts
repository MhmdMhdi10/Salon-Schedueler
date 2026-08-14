import { controllerRouteDto, type ControllerDtoDefinition } from '../../common/dto/index.js';
import { HealthDto } from './health.dto.js';

const route = controllerRouteDto.bind(null, 'HealthController');

export const HEALTH_CONTROLLER_DTO_DEFINITIONS = [
  route('health.read', 'GET', '/healthz', undefined, undefined, HealthDto),
] as const satisfies readonly ControllerDtoDefinition[];
