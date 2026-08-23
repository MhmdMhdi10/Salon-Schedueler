import { z } from 'zod';
import { EmptyDto, IdParamDto, ServiceIdParamDto, StaffIdParamDto } from '../../common/dto/index.js';

const staffRole = z.enum(['Owner', 'Admin', 'Stylist']);
const bool = z.boolean();
const loose = z.object({}).passthrough();

export const AdminCalendarQueryDto = z
  .object({ from: z.string().trim().min(1), to: z.string().trim().min(1), view: z.string().optional() })
  .passthrough();
export const AdminWaitlistQueryDto = z.object({ from: z.string().optional(), to: z.string().optional() }).passthrough();
export const AdminClientQueryDto = z.object({ search: z.string().max(80).optional() }).passthrough();
export const AdminClientDto = z.object({ fullName: z.string().trim().min(2).max(120), phone: z.string().trim().min(1) }).passthrough();
export const AdminSmsSettingsDto = z
  .object({
    ownerBooking: bool.optional(),
    stylistBooking: bool.optional(),
    ownerReminder: bool.optional(),
    stylistReminder: bool.optional(),
    ownerCancellation: bool.optional(),
    stylistCancellation: bool.optional(),
  })
  .passthrough();
export const AdminStaffDto = z
  .object({ fullName: z.string().trim().min(1).max(120), role: staffRole, phone: z.string().trim().min(1).optional() })
  .passthrough();
export const AdminStaffPatchDto = z.object({ fullName: z.string().trim().min(1).optional(), role: staffRole.optional(), phone: z.string().optional(), active: bool.optional() }).passthrough();
export const AdminChairDto = z.object({ name: z.string().trim().min(1).max(120) }).passthrough();
export const AdminChairPatchDto = z.object({ name: z.string().trim().min(1).optional(), active: bool.optional() }).passthrough();
export const AdminServiceDto = z
  .object({
    name: z.string().trim().min(1).max(120),
    durationMinutes: z.coerce.number().int().positive().optional(),
    bufferMinutes: z.coerce.number().int().min(0).max(120).optional(),
    priceRial: z.coerce.number().int().min(0).optional(),
    requiresDeposit: bool.optional(),
    depositRial: z.coerce.number().int().min(0).optional(),
  })
  .passthrough();
export const AdminServicePatchDto = AdminServiceDto.partial().passthrough();
export const AdminServiceStaffDto = z.object({ staffIds: z.array(z.string().trim().min(1)) }).passthrough();
export const AdminApprovalPolicyDto = z.object({ autoApprove: z.union([bool, z.literal('true'), z.literal('false')]).optional() }).passthrough();
export const AdminOwnApprovalDto = z.object({ allowed: z.union([bool, z.literal('true'), z.literal('false')]).optional(), autoApprove: z.union([bool, z.literal('true'), z.literal('false'), z.null()]).optional() }).passthrough();
export const AdminBookingPolicyDto = z.object({ bookingWindowDays: z.coerce.number().int().min(0).optional(), workMode: z.string().trim().min(1).optional() }).passthrough();
export const AdminBrandAccentDto = z.object({ brandAccent: z.string().trim().max(40).nullable().optional() }).passthrough();
export const AdminDepositSettingsDto = z
  .object({
    depositMethod: z.enum(['gateway', 'card_transfer']),
    depositCardNumber: z.string().trim().max(32).optional(),
    depositCardHolder: z.string().trim().max(120).optional(),
    depositBankName: z.string().trim().max(80).optional(),
  })
  .passthrough();
export const AdminHolidayDto = z.object({ onDate: z.string().trim().min(1), toDate: z.string().optional(), startTime: z.string().optional(), endTime: z.string().optional(), cancelAppointments: bool.optional() }).passthrough();
export const AdminEmergencyCloseDto = z.object({ onDate: z.string().trim().min(1), cancelAppointments: bool.optional() }).passthrough();
export const AdminWorkingHoursDto = loose;
export const AdminAvailabilityBlockDto = z.object({ onDate: z.string().optional(), toDate: z.string().optional(), startTime: z.string().optional(), endTime: z.string().optional(), startAt: z.string().optional(), endAt: z.string().optional() }).passthrough();
export const AdminNoteDto = z.object({ body: z.string().trim().min(1).max(1000) }).passthrough();
export const AdminMessageDto = z.object({ message: z.string().trim().min(1).max(500) }).passthrough();
export const AdminEmptyBodyDto = EmptyDto;
export const AdminIdDto = IdParamDto;
export const AdminStaffIdDto = StaffIdParamDto;
export const AdminServiceIdDto = ServiceIdParamDto;
