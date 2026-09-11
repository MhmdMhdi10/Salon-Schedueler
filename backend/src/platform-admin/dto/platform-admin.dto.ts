import { z } from 'zod';
import { IdParamDto } from '../../common/dto/index.js';

export const PlatformAdminQueryDto = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    search: z.string().optional(),
    status: z.string().optional(),
    salonId: z.string().optional(),
    source: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .passthrough();
export const PlatformAdminIdDto = IdParamDto;
export const PlatformAdminDetailParamDto = z.object({ resource: z.string().trim().min(1), id: z.string().trim().min(1) }).passthrough();
export const PlatformAdminStatusDto = z.object({ active: z.boolean() }).passthrough();
export const PlatformAdminAppointmentActionDto = z.object({ action: z.enum(['approve', 'reject', 'cancel', 'no_show', 'complete']) }).passthrough();
export const PlatformCardOrderUpdateDto = z
  .object({
    status: z.enum(['received', 'contacted', 'in_print', 'shipped', 'completed', 'cancelled']),
    note: z.string().trim().max(1000).optional(),
  })
  .passthrough();
export const PlatformSupportTicketUpdateDto = z
  .object({
    status: z.enum(['open', 'triaged', 'in_progress', 'resolved', 'closed']).optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    resolution: z.string().trim().max(2000).optional(),
    assignedAdminId: z.string().uuid().nullable().optional(),
  })
  .passthrough();

const platformPhone = z.string().trim().min(1).max(20);
const platformName = z.string().trim().min(1).max(160);
const nullableText = (max: number) => z.string().trim().max(max).nullable();

export const PlatformSalonCreateDto = z.object({
  salonName: platformName,
  ownerName: platformName,
  phone: platformPhone,
  timezone: z.string().trim().max(80).optional(),
  businessType: z.string().trim().max(120).optional(),
  workMode: z.enum(['fixed_salon', 'rented_chair', 'home', 'mobile', 'hybrid', 'not_decided']).optional(),
}).passthrough();

export const PlatformSalonUpdateDto = z.object({
  name: platformName.optional(),
  timezone: z.string().trim().max(80).optional(),
  businessType: nullableText(120).optional(),
  brandAccent: nullableText(40).optional(),
  workMode: z.enum(['fixed_salon', 'rented_chair', 'home', 'mobile', 'hybrid', 'not_decided']).optional(),
  autoApprove: z.boolean().optional(),
  bookingWindowDays: z.number().int().min(0).max(365).optional(),
  bookingStartOffsetDays: z.number().int().min(0).max(1).optional(),
  active: z.boolean().optional(),
}).passthrough();

export const PlatformCustomerCreateDto = z.object({
  phone: platformPhone,
  fullName: z.string().trim().max(120).nullable().optional(),
}).passthrough();

export const PlatformCustomerUpdateDto = z.object({
  phone: platformPhone.optional(),
  fullName: z.string().trim().max(120).nullable().optional(),
}).passthrough();

export const PlatformStaffCreateDto = z.object({
  salonId: z.string().trim().min(1),
  fullName: platformName,
  role: z.enum(['Owner', 'Admin', 'Stylist']),
  phone: platformPhone.nullable().optional(),
}).passthrough();

export const PlatformStaffUpdateDto = z.object({
  fullName: platformName.optional(),
  role: z.enum(['Owner', 'Admin', 'Stylist']).optional(),
  phone: platformPhone.nullable().optional(),
  active: z.boolean().optional(),
}).passthrough();

export const PlatformServiceCreateDto = z.object({
  salonId: z.string().trim().min(1),
  name: platformName,
  durationMinutes: z.number().int().min(5).max(480),
  durationMode: z.enum(['fixed', 'variable']).optional(),
  minDurationMinutes: z.number().int().min(5).max(480).nullable().optional(),
  maxDurationMinutes: z.number().int().min(5).max(480).nullable().optional(),
  bufferMinutes: z.number().int().min(0).max(120).optional(),
  priceRial: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  requiresDeposit: z.boolean().optional(),
  depositRial: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  depositType: z.enum(['fixed', 'percentage']).optional(),
  depositPercent: z.number().int().min(1).max(100).nullable().optional(),
}).passthrough();

export const PlatformServiceUpdateDto = PlatformServiceCreateDto.omit({ salonId: true, name: true, durationMinutes: true }).extend({
  name: platformName.optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  active: z.boolean().optional(),
}).passthrough();

export const PlatformSalonResourceCreateDto = z.object({
  salonId: z.string().trim().min(1),
  name: platformName,
  kind: z.enum(['physical', 'mobile']).optional(),
}).passthrough();

export const PlatformSalonResourceUpdateDto = z.object({
  name: platformName.optional(),
  active: z.boolean().optional(),
}).passthrough();

export const PlatformAppointmentCreateDto = z.object({
  salonId: z.string().trim().min(1),
  serviceId: z.string().trim().min(1),
  startAt: z.string().trim().min(1),
  phone: platformPhone,
  fullName: z.string().trim().max(120).optional(),
  preferredStaffId: z.string().trim().min(1).optional(),
  locationType: z.enum(['salon', 'customer']).optional(),
  locationAddress: z.string().trim().max(1000).optional(),
  customerNote: z.string().trim().max(1000).optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
}).passthrough();

export const PlatformAppointmentUpdateDto = z.object({
  customerNote: nullableText(1000).optional(),
  locationType: z.enum(['salon', 'customer']).optional(),
  locationAddress: nullableText(1000).optional(),
}).passthrough();

export const PlatformSubscriptionUpdateDto = z.object({
  status: z.enum(['trial', 'active', 'grace', 'expired']).optional(),
  planKind: z.enum(['trial', 'monthly', 'quarterly', 'annual']).optional(),
  expiresAt: z.string().trim().min(1).optional(),
  graceUntil: z.string().trim().min(1).nullable().optional(),
}).passthrough();

export const PlatformWaitlistUpdateDto = z.object({
  status: z.enum(['waiting', 'notified', 'fulfilled', 'cancelled']).optional(),
  windowStart: z.string().trim().min(1).optional(),
  windowEnd: z.string().trim().min(1).optional(),
}).passthrough();

export const PlatformPaymentUpdateDto = z.object({
  kind: z.enum(['appointment', 'subscription']),
  status: z.enum(['pending', 'paid', 'refunded', 'retained', 'failed']),
}).passthrough();

export const PlatformAdminCreateDto = z.object({
  phone: platformPhone,
  fullName: platformName,
  role: z.string().trim().min(1).max(60).optional(),
  active: z.boolean().optional(),
}).passthrough();

export const PlatformAdminUpdateDto = z.object({
  phone: platformPhone.optional(),
  fullName: platformName.optional(),
  role: z.string().trim().min(1).max(60).optional(),
  active: z.boolean().optional(),
}).passthrough();
