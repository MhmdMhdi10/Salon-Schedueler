import type { Salon, Subscription, SubscriptionPayment } from '@prisma/client';

export type SubscriptionModel = Subscription | SubscriptionPayment | Salon;
