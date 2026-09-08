import { z } from 'zod';
import { IdParamDto } from '../../common/dto/index.js';

const locationType = z.enum(['salon', 'customer']);
const locationFields = {
  locationType: locationType.optional(),
  locationAddress: z.string().trim().max(300).optional(),
};

export const AppointmentIdDto = IdParamDto;
export const CreateAppointmentDto = z
  .object({
    salonId: z.string().trim().min(1),
    serviceId: z.string().trim().min(1).optional(),
    serviceIds: z.array(z.string().trim().min(1)).min(1).optional(),
    startAt: z.string().trim().min(1),
    preferredStaffId: z.string().trim().min(1).optional(),
    durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
    customerNote: z.string().trim().max(1000).optional(),
    website: z.string().optional(),
    ...locationFields,
  })
  .passthrough()
  .refine((value) => Boolean(value.serviceId || value.serviceIds?.length), {
    path: ['serviceId'],
    message: 'serviceId or serviceIds is required',
  });
export const ManualAppointmentDto = z
  .object({
    serviceId: z.string().trim().min(1),
    startAt: z.string().trim().min(1),
    phone: z.string().trim().min(1),
    fullName: z.string().trim().max(120).optional(),
    preferredStaffId: z.string().trim().min(1).optional(),
    durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
    customerNote: z.string().trim().max(1000).optional(),
    ...locationFields,
  })
  .passthrough();
export const RescheduleAppointmentDto = z
  .object({
    startAt: z.string().trim().min(1),
    preferredStaffId: z.string().trim().min(1).optional(),
  })
  .passthrough();
export const ManagedRescheduleDto = RescheduleAppointmentDto;
export const EmptyAppointmentBodyDto = z
  .object({
    kind: z.enum(['standard', 'emergency']).optional(),
    reason: z.string().trim().max(1000).optional(),
    refundProof: z.object({
      fileName: z.string().trim().min(1).max(120),
      mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      dataBase64: z.string().max(7_200_000),
    }).optional(),
  })
  .passthrough();
export const RejectAppointmentDto = z.object({ reason: z.string().trim().max(1000).optional() }).passthrough();
export const ReportCustomerDto = z.object({ reason: z.string().trim().min(5).max(1000), block: z.boolean().optional() }).passthrough();
export const DepositReceiptDto = z
  .object({
    fileName: z.string().trim().min(1).max(120),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    dataBase64: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(7_200_000),
  })
  .passthrough();
export const DepositReceiptReviewDto = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    note: z.string().trim().max(500).optional(),
  })
  .passthrough();

export type CreateAppointmentInput = z.infer<typeof CreateAppointmentDto>;
export type RescheduleAppointmentInput = z.infer<typeof RescheduleAppointmentDto>;
