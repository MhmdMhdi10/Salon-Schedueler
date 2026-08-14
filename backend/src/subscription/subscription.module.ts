import { defineFeatureModule } from '../common/modules/index.js';
import { SubscriptionController } from './controllers/index.js';
import { SubscriptionSchema } from './schemas/index.js';
import { SubscriptionService } from './services/index.js';

export const SubscriptionModule = defineFeatureModule({
  name: 'subscription',
  imports: [],
  controllers: [SubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
  schemas: [SubscriptionSchema],
  dtoPrefix: 'subscription.',
  persistence: 'prisma',
} as const);
