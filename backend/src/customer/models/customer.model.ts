import type { Appointment, Customer, CustomerNote, SalonClient } from '@prisma/client';

export type CustomerModel = Customer | SalonClient | CustomerNote | Appointment;
