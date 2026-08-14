import { controllerRouteDto, type ControllerDtoDefinition } from '../../common/dto/index.js';
import { QrSalonParamDto, QrStaffParamDto } from './qr.dto.js';

const route = controllerRouteDto.bind(null, 'QrController');

export const QR_CONTROLLER_DTO_DEFINITIONS = [
  route('qr.salon.read', 'GET', '/api/salons/:id/qr', QrSalonParamDto),
  route('qr.staff.read', 'GET', '/api/salons/:id/staff/:staffId/qr', QrStaffParamDto),
] as const satisfies readonly ControllerDtoDefinition[];
