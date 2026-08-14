import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const TransactionSchema = definePrismaFeatureSchema({
  feature: 'transaction',
  persistence: 'prisma',
  models: ['Payment', 'SubscriptionPayment', 'Appointment'],
} as const);
