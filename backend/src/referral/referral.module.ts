import { defineFeatureModule } from '../common/modules/index.js';
import { ReferralController } from './controllers/index.js';
import { ReferralSchema } from './schemas/index.js';
import { ReferralService } from './services/index.js';

export const ReferralModule = defineFeatureModule({
  name: 'referral',
  imports: [],
  controllers: [ReferralController],
  providers: [ReferralService],
  exports: [ReferralService],
  schemas: [ReferralSchema],
  dtoPrefix: 'referral.',
  persistence: 'prisma',
} as const);
