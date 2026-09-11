import { definePrismaFeatureSchema } from '../../common/schemas/index.js';

export const PlatformAdminSchema = definePrismaFeatureSchema({
  feature: 'platform-admin',
  persistence: 'prisma',
  models: [
    'PlatformAdmin',
    'PlatformAuditLog',
    'Salon',
    'Customer',
    'StaffMember',
    'Service',
    'Chair',
    'Equipment',
    'Appointment',
    'WaitlistEntry',
    'Subscription',
    'Payment',
    'SubscriptionPayment',
    'CardOrder',
    'SupportTicket',
    'QrScanEvent',
  ],
} as const);
