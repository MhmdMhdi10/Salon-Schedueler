import { z } from 'zod';

export const StaffRoleSchema = z.enum(['Owner', 'Admin', 'Stylist']);

export const AppointmentStatusSchema = z.enum([
  'held',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
  'expired',
]);

export const AppointmentSourceSchema = z.enum(['web', 'mobile', 'walkin']);

export const PaymentStatusSchema = z.enum(['pending', 'paid', 'refunded', 'retained', 'failed']);

export const WaitlistStatusSchema = z.enum(['waiting', 'notified', 'fulfilled', 'cancelled']);
