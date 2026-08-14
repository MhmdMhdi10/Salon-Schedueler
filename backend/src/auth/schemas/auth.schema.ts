import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const AuthSchema = definePrismaFeatureSchema({
  feature: 'auth',
  persistence: 'prisma',
  models: ['Otp', 'StaffMember', 'PlatformAdmin'],
} as const);
