import { controllerRouteDto, type ControllerDtoDefinition } from '../../common/dto/index.js';
import { AnyQueryDto, IdParamDto } from '../../common/dto/index.js';
import { WaitlistBodyDto } from './waitlist.dto.js';

const route = controllerRouteDto.bind(null, 'WaitlistController');

export const WAITLIST_CONTROLLER_DTO_DEFINITIONS = [
  route('waitlist.create', 'POST', '/api/salons/:id/waitlist', IdParamDto, AnyQueryDto, WaitlistBodyDto),
] as const satisfies readonly ControllerDtoDefinition[];
