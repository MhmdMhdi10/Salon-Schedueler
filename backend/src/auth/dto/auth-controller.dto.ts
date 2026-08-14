import {
  controllerRouteDto,
  EmptyDto,
  type ControllerDtoDefinition,
} from '../../common/dto/index.js';
import { AuthRefreshDto, AuthRequestDto, AuthVerifyDto } from './auth.dto.js';

const route = controllerRouteDto.bind(null, 'AuthController');

export const AUTH_CONTROLLER_DTO_DEFINITIONS = [
  route('auth.otp.request', 'POST', '/api/auth/otp/request', undefined, undefined, AuthRequestDto),
  route('auth.otp.verify', 'POST', '/api/auth/otp/verify', undefined, undefined, AuthVerifyDto),
  route('auth.refresh', 'POST', '/api/auth/refresh', undefined, undefined, AuthRefreshDto),
  route('auth.logout', 'POST', '/api/auth/logout', undefined, undefined, EmptyDto),
] as const satisfies readonly ControllerDtoDefinition[];
