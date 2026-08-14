import type { Appointment, Chair, Customer, Salon, Service, StaffMember } from '@prisma/client';

export type AdminModel = Salon | StaffMember | Appointment | Customer | Service | Chair;
