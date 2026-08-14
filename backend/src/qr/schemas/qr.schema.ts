import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const QrSchema = definePrismaFeatureSchema({
  feature: 'qr',
  persistence: 'prisma',
  models: ['QrScanEvent', 'Salon', 'StaffMember'],
} as const);
