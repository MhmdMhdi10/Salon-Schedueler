import { controllerRouteDto, type ControllerDtoDefinition } from '../../common/dto/index.js';
import { IdParamDto } from '../../common/dto/index.js';
import { InboxNotificationIdDto, InboxQueryDto } from './inbox.dto.js';

const route = controllerRouteDto.bind(null, 'InboxController');

export const INBOX_CONTROLLER_DTO_DEFINITIONS = [
  route('inbox.notifications.list', 'GET', '/api/salons/:id/notifications', IdParamDto, InboxQueryDto),
  route('inbox.notifications.unread-count', 'GET', '/api/salons/:id/notifications/unread-count', IdParamDto),
  route('inbox.notifications.read', 'PATCH', '/api/notifications/:id/read', InboxNotificationIdDto),
  route('inbox.notifications.read-all', 'POST', '/api/salons/:id/notifications/read-all', IdParamDto),
] as const satisfies readonly ControllerDtoDefinition[];
