import {
  controllerRouteDto,
  EmptyDto,
  type ControllerDtoDefinition,
} from '../../common/dto/index.js';
import { AuthContextDto, AuthRefreshDto, AuthRequestDto, AuthVerifyDto } from './auth.dto.js';

const route = controllerRouteDto.bind(null, 'AuthController');

export const AUTH_CONTROLLER_DTO_DEFINITIONS = [
  route('auth.otp.request', 'POST', '/api/auth/otp/request', undefined, undefined, AuthRequestDto),
  route('auth.otp.verify', 'POST', '/api/auth/otp/verify', undefined, undefined, AuthVerifyDto),
  route('auth.refresh', 'POST', '/api/auth/refresh', undefined, undefined, AuthRefreshDto),
  route('auth.logout', 'POST', '/api/auth/logout', undefined, undefined, EmptyDto),
  route('auth.context.select', 'POST', '/api/auth/context', undefined, undefined, AuthContextDto),
  route('auth.contexts.list', 'GET', '/api/auth/contexts', undefined, undefined, EmptyDto),
] as const satisfies readonly ControllerDtoDefinition[];
