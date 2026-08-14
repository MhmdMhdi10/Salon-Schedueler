import type { Appointment, Customer, PlatformAdmin, PlatformAuditLog, Salon, StaffMember } from '@prisma/client';

export type PlatformAdminModel = PlatformAdmin | PlatformAuditLog | Salon | Customer | StaffMember | Appointment;
