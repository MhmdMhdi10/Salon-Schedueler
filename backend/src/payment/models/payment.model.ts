import type { Appointment, Payment, SubscriptionPayment } from '@prisma/client';

export type PaymentModel = Payment | SubscriptionPayment | Appointment;
