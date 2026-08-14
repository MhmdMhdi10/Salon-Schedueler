import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const SubscriptionSchema = definePrismaFeatureSchema({
  feature: 'subscription',
  persistence: 'prisma',
  models: ['Subscription', 'SubscriptionPayment', 'Salon'],
} as const);
