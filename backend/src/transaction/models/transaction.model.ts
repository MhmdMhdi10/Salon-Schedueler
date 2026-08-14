import type { Appointment, Payment, SubscriptionPayment } from '@prisma/client';

export type TransactionModel = Payment | SubscriptionPayment | Appointment;
