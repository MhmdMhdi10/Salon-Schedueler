import { controllerRouteDto, type ControllerDtoDefinition } from '../../common/dto/index.js';
import { AnyQueryDto, EmptyDto } from '../../common/dto/index.js';
import { CheckPhoneQueryDto, RegisterSalonDto } from './registration.dto.js';

const route = controllerRouteDto.bind(null, 'RegistrationController');

export const REGISTRATION_CONTROLLER_DTO_DEFINITIONS = [
  route('registration.salon.create', 'POST', '/api/register/salon', EmptyDto, AnyQueryDto, RegisterSalonDto),
  route('registration.phone.check', 'GET', '/api/register/check-phone', EmptyDto, CheckPhoneQueryDto),
] as const satisfies readonly ControllerDtoDefinition[];
