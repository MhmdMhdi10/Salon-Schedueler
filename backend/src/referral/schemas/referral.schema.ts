import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const ReferralSchema = definePrismaFeatureSchema({
  feature: 'referral',
  persistence: 'prisma',
  models: ['SalonReferral', 'Salon', 'Customer'],
} as const);
