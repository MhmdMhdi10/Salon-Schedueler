import { controllerRouteDto, type ControllerDtoDefinition } from '../../common/dto/index.js';
import { AnyQueryDto, EmptyDto, IdParamDto } from '../../common/dto/index.js';
import {
  AppointmentIdDto,
  CreateAppointmentDto,
  EmptyAppointmentBodyDto,
  ManagedRescheduleDto,
  ManualAppointmentDto,
  RescheduleAppointmentDto,
  DepositReceiptDto,
  DepositReceiptReviewDto,
} from './appointment.dto.js';

const route = controllerRouteDto.bind(null, 'AppointmentController');

export const APPOINTMENT_CONTROLLER_DTO_DEFINITIONS = [
  route('appointment.create', 'POST', '/api/appointments', EmptyDto, AnyQueryDto, CreateAppointmentDto),
  route('appointment.cancel', 'POST', '/api/appointments/:id/cancel', AppointmentIdDto, AnyQueryDto, EmptyAppointmentBodyDto),
  route('appointment.manual', 'POST', '/api/salons/:id/appointments/manual', IdParamDto, AnyQueryDto, ManualAppointmentDto),
  route('appointment.reschedule', 'POST', '/api/appointments/:id/reschedule', AppointmentIdDto, AnyQueryDto, RescheduleAppointmentDto),
  route('appointment.no-show', 'POST', '/api/appointments/:id/no-show', AppointmentIdDto),
  route('appointment.approve', 'POST', '/api/appointments/:id/approve', AppointmentIdDto),
  route('appointment.reject', 'POST', '/api/appointments/:id/reject', AppointmentIdDto),
  route('appointment.reschedule-managed', 'PATCH', '/api/appointments/:id/reschedule', AppointmentIdDto, AnyQueryDto, ManagedRescheduleDto),
  route('appointment.deposit.read', 'GET', '/api/appointments/:id/deposit', AppointmentIdDto),
  route('appointment.deposit-receipt.upload', 'POST', '/api/appointments/:id/deposit-receipt', AppointmentIdDto, AnyQueryDto, DepositReceiptDto),
  route('appointment.deposit-receipt.read', 'GET', '/api/appointments/:id/deposit-receipt', AppointmentIdDto),
  route('appointment.deposit-receipt.review', 'POST', '/api/appointments/:id/deposit-receipt/review', AppointmentIdDto, AnyQueryDto, DepositReceiptReviewDto),
] as const satisfies readonly ControllerDtoDefinition[];
