import { defineFeatureModule } from '../common/modules/index.js';
import { TransactionController } from './controllers/index.js';
import { TransactionSchema } from './schemas/index.js';
import { AnalyticsService } from './services/index.js';

export const TransactionModule = defineFeatureModule({
  name: 'transaction',
  imports: [],
  controllers: [TransactionController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
  schemas: [TransactionSchema],
  dtoPrefix: 'transaction.',
  persistence: 'prisma',
} as const);
