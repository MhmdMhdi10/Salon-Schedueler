import type { Customer, Salon, SalonReferral } from '@prisma/client';

export type ReferralModel = SalonReferral | Salon | Customer;
