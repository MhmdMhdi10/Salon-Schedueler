import type { Customer, Salon, Service, WaitlistEntry } from '@prisma/client';

export type WaitlistModel = WaitlistEntry | Customer | Service | Salon;
