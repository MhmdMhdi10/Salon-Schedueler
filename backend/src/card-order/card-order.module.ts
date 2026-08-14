import { defineFeatureModule } from '../common/modules/index.js';
import { CardOrderController } from './controllers/index.js';
import { CardOrderSchema } from './schemas/index.js';
import { CardOrderService } from './services/index.js';

export const CardOrderModule = defineFeatureModule({
  name: 'card-order',
  imports: [],
  controllers: [CardOrderController],
  providers: [CardOrderService],
  exports: [CardOrderService],
  schemas: [CardOrderSchema],
  dtoPrefix: 'card-order.',
  persistence: 'prisma',
} as const);
