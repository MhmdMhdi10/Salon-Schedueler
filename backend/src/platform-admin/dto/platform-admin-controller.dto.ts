import { controllerRouteDto, controllerPathParams, type ControllerDtoDefinition } from '../../common/dto/index.js';
import { AnyQueryDto, EmptyDto } from '../../common/dto/index.js';
import {
  PlatformAdminAppointmentActionDto,
  PlatformAdminDetailParamDto,
  PlatformAdminIdDto,
  PlatformAdminQueryDto,
  PlatformAdminStatusDto,
} from './platform-admin.dto.js';

const route = controllerRouteDto.bind(null, 'PlatformAdminController');

export const PLATFORM_ADMIN_CONTROLLER_DTO_DEFINITIONS = [
  route('platform-admin.dashboard.read', 'GET', '/api/platform-admin/dashboard'),
  route('platform-admin.salons.list', 'GET', '/api/platform-admin/salons', EmptyDto, PlatformAdminQueryDto),
  route('platform-admin.salons.read', 'GET', '/api/platform-admin/salons/:id', PlatformAdminIdDto),
  route('platform-admin.details.read', 'GET', '/api/platform-admin/details/:resource/:id', PlatformAdminDetailParamDto),
  route('platform-admin.salons.status', 'PATCH', '/api/platform-admin/salons/:id/status', PlatformAdminIdDto, AnyQueryDto, PlatformAdminStatusDto),
  route('platform-admin.customers.list', 'GET', '/api/platform-admin/customers', EmptyDto, PlatformAdminQueryDto),
  route('platform-admin.staff.list', 'GET', '/api/platform-admin/staff', EmptyDto, PlatformAdminQueryDto),
  route('platform-admin.staff.status', 'PATCH', '/api/platform-admin/staff/:id/status', PlatformAdminIdDto, AnyQueryDto, PlatformAdminStatusDto),
  route('platform-admin.appointments.list', 'GET', '/api/platform-admin/appointments', EmptyDto, PlatformAdminQueryDto),
  route('platform-admin.appointments.action', 'POST', '/api/platform-admin/appointments/:id/action', PlatformAdminIdDto, AnyQueryDto, PlatformAdminAppointmentActionDto),
  route('platform-admin.subscriptions.list', 'GET', '/api/platform-admin/subscriptions', EmptyDto, PlatformAdminQueryDto),
  route('platform-admin.payments.list', 'GET', '/api/platform-admin/payments', EmptyDto, PlatformAdminQueryDto),
  route('platform-admin.waitlist.list', 'GET', '/api/platform-admin/waitlist', EmptyDto, PlatformAdminQueryDto),
  route('platform-admin.qr-scans.list', 'GET', '/api/platform-admin/qr-scans', EmptyDto, PlatformAdminQueryDto),
  route('platform-admin.audit-logs.list', 'GET', '/api/platform-admin/audit-logs', EmptyDto, PlatformAdminQueryDto),
] as const satisfies readonly ControllerDtoDefinition[];
