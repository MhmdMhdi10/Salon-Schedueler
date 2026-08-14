import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const AdminSchema = definePrismaFeatureSchema({
  feature: 'admin',
  persistence: 'prisma',
  models: ['Salon', 'StaffMember', 'Appointment', 'Customer', 'Service', 'Chair'],
} as const);
