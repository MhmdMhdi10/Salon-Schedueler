import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const CustomerSchema = definePrismaFeatureSchema({
  feature: 'customer',
  persistence: 'prisma',
  models: ['Customer', 'SalonClient', 'CustomerNote', 'Appointment'],
} as const);
