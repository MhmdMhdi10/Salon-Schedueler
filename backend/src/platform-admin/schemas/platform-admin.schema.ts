import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const PlatformAdminSchema = definePrismaFeatureSchema({
  feature: 'platform-admin',
  persistence: 'prisma',
  models: ['PlatformAdmin', 'PlatformAuditLog', 'Salon', 'Customer', 'StaffMember', 'Appointment'],
} as const);
