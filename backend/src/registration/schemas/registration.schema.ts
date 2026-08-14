import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const RegistrationSchema = definePrismaFeatureSchema({
  feature: 'registration',
  persistence: 'prisma',
  models: ['Salon', 'StaffMember', 'Subscription', 'Service', 'Chair'],
} as const);
