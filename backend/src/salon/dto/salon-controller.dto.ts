import { controllerRouteDto, type ControllerDtoDefinition } from '../../common/dto/index.js';
import { AnyQueryDto } from '../../common/dto/index.js';
import {
  SalonAvailabilityQueryDto,
  SalonQrParamDto,
  SalonScanBodyDto,
  SalonScanQueryDto,
  SalonIdDto,
} from './salon.dto.js';

const route = controllerRouteDto.bind(null, 'SalonController');

export const SALON_CONTROLLER_DTO_DEFINITIONS = [
  route('salon.qr.resolve', 'GET', '/api/salons/by-qr/:payload', SalonQrParamDto),
  route('salon.brand.read', 'GET', '/api/salons/:id/brand', SalonIdDto),
  route('salon.stylists.list', 'GET', '/api/salons/:id/stylists', SalonIdDto),
  route('salon.booking-policy.read', 'GET', '/api/salons/:id/booking-policy', SalonIdDto),
  route('salon.services.list', 'GET', '/api/salons/:id/services', SalonIdDto),
  route('salon.availability.read', 'GET', '/api/salons/:id/availability', SalonIdDto, SalonAvailabilityQueryDto),
  route('salon.scan.create', 'POST', '/api/salons/:id/scan', SalonIdDto, SalonScanQueryDto, SalonScanBodyDto),
] as const satisfies readonly ControllerDtoDefinition[];
