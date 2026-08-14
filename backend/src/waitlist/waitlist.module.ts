import { defineFeatureModule } from '../common/modules/index.js';
import { WaitlistController } from './controllers/index.js';
import { WaitlistSchema } from './schemas/index.js';
import { WaitlistService } from './services/index.js';

export const WaitlistModule = defineFeatureModule({
  name: 'waitlist',
  imports: [],
  controllers: [WaitlistController],
  providers: [WaitlistService],
  exports: [WaitlistService],
  schemas: [WaitlistSchema],
  dtoPrefix: 'waitlist.',
  persistence: 'prisma',
} as const);
