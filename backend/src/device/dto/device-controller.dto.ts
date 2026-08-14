import { controllerRouteDto, type ControllerDtoDefinition } from '../../common/dto/index.js';
import { AnyQueryDto, EmptyDto } from '../../common/dto/index.js';
import { RegisterDeviceDto } from './device.dto.js';

const route = controllerRouteDto.bind(null, 'DeviceController');

export const DEVICE_CONTROLLER_DTO_DEFINITIONS = [
  route('device.token.register', 'POST', '/api/devices/token', EmptyDto, AnyQueryDto, RegisterDeviceDto),
] as const satisfies readonly ControllerDtoDefinition[];
