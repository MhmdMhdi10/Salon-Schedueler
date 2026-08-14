import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const WaitlistSchema = definePrismaFeatureSchema({
  feature: 'waitlist',
  persistence: 'prisma',
  models: ['WaitlistEntry', 'Customer', 'Service', 'Salon'],
} as const);
