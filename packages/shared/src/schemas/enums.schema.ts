import { z } from 'zod';

export const StaffRoleSchema = z.enum(['Owner', 'Admin', 'Stylist']);

export const SalonWorkModeSchema = z.enum([
  'fixed_salon',
  'rented_chair',
  'home',
  'mobile',
  'hybrid',
  'not_decided',
]);

export const AppointmentLocationSchema = z.enum(['salon', 'customer']);

export const AppointmentStatusSchema = z.enum([
  'pending',
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
