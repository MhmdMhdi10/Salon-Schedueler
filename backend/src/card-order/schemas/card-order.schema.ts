import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const CardOrderSchema = definePrismaFeatureSchema({
  feature: 'card-order',
  persistence: 'prisma',
  models: [],
} as const);
