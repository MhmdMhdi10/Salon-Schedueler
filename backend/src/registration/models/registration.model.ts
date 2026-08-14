import type { Chair, Salon, Service, StaffMember, Subscription } from '@prisma/client';

export type RegistrationModel = Salon | StaffMember | Subscription | Service | Chair;
