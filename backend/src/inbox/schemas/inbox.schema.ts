import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const InboxSchema = definePrismaFeatureSchema({
  feature: 'inbox',
  persistence: 'prisma',
  models: ['SalonNotification', 'NotificationLog'],
} as const);
