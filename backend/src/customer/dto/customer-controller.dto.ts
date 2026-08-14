import { controllerRouteDto, type ControllerDtoDefinition } from '../../common/dto/index.js';
import { AnyQueryDto, EmptyDto } from '../../common/dto/index.js';
import { CustomerProfilePatchDto, EmptyCustomerBodyDto } from './customer.dto.js';
import { WaitlistIdDto } from '../../waitlist/dto/index.js';

const route = controllerRouteDto.bind(null, 'CustomerController');

export const CUSTOMER_CONTROLLER_DTO_DEFINITIONS = [
  route('customer.profile.read', 'GET', '/api/customers/me/profile'),
  route('customer.profile.update', 'PATCH', '/api/customers/me/profile', EmptyDto, AnyQueryDto, CustomerProfilePatchDto),
  route('customer.appointments.list', 'GET', '/api/customers/me/appointments'),
  route('customer.waitlist.list', 'GET', '/api/customers/me/waitlist'),
  route('customer.waitlist.delete', 'DELETE', '/api/waitlist/:id', WaitlistIdDto, AnyQueryDto, EmptyCustomerBodyDto),
] as const satisfies readonly ControllerDtoDefinition[];
