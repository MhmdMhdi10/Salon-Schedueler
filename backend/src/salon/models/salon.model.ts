import type { Chair, Holiday, Salon, Service, StaffMember, WorkingHours } from '@prisma/client';

export type SalonModel = Salon | Service | StaffMember | Chair | WorkingHours | Holiday;
