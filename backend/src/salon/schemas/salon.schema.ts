import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const SalonSchema = definePrismaFeatureSchema({
  feature: 'salon',
  persistence: 'prisma',
  models: ['Salon', 'Service', 'StaffMember', 'Chair', 'WorkingHours', 'Holiday'],
} as const);
