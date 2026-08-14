import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const PaymentSchema = definePrismaFeatureSchema({
  feature: 'payment',
  persistence: 'prisma',
  models: ['Payment', 'SubscriptionPayment', 'Appointment'],
} as const);
