import { defineFeatureModule } from '../common/modules/index.js';
import { HealthController } from './controllers/index.js';
import { HealthSchema } from './schemas/index.js';
import { HealthService } from './services/index.js';

export const HealthModule = defineFeatureModule({
  name: 'health',
  imports: [],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
  schemas: [HealthSchema],
  dtoPrefix: 'health.',
  persistence: 'prisma',
} as const);
