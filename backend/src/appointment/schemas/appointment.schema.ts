import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const AppointmentSchema = definePrismaFeatureSchema({
  feature: 'appointment',
  persistence: 'prisma',
  models: ['Appointment', 'Payment', 'Service', 'StaffMember', 'Customer'],
} as const);
