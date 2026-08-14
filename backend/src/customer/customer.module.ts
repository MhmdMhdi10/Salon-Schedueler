import { defineFeatureModule } from '../common/modules/index.js';
import { CustomerController } from './controllers/index.js';
import { CustomerSchema } from './schemas/index.js';
import { CustomerService, SalonClientService } from './services/index.js';

export const CustomerModule = defineFeatureModule({
  name: 'customer',
  imports: [],
  controllers: [CustomerController],
  providers: [CustomerService, SalonClientService],
  exports: [CustomerService, SalonClientService],
  schemas: [CustomerSchema],
  dtoPrefix: 'customer.',
  persistence: 'prisma',
} as const);
