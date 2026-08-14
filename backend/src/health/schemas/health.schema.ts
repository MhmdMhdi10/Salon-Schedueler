import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const HealthSchema = definePrismaFeatureSchema({
  feature: 'health',
  persistence: 'prisma',
  models: [],
} as const);
