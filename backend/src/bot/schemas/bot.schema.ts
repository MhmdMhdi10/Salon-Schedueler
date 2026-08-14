import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const BotSchema = definePrismaFeatureSchema({
  feature: 'bot',
  persistence: 'prisma',
  models: ['BotChat', 'BotSession', 'Appointment', 'Customer'],
} as const);
