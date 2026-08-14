import { defineFeatureModule } from '../common/modules/index.js';
import { PaymentController } from './controllers/index.js';
import { PaymentSchema } from './schemas/index.js';
import { IdPayAdapter, MockGateway, PaymentService, ZarinpalAdapter } from './services/index.js';

export const PaymentModule = defineFeatureModule({
  name: 'payment',
  imports: [],
  controllers: [PaymentController],
  providers: [PaymentService, IdPayAdapter, ZarinpalAdapter, MockGateway],
  exports: [PaymentService, IdPayAdapter, ZarinpalAdapter, MockGateway],
  schemas: [PaymentSchema],
  dtoPrefix: 'payment.',
  persistence: 'prisma',
} as const);
