import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const DeviceSchema = definePrismaFeatureSchema({
  feature: 'device',
  persistence: 'prisma',
  models: ['DeviceToken'],
} as const);
