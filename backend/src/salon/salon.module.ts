import { defineFeatureModule } from '../common/modules/index.js';
import { SalonController } from './controllers/index.js';
import { SalonSchema } from './schemas/index.js';
import { AvailabilityConfig, QrService, ResourceRegistration, SalonRegistration, ServiceCatalog } from './services/index.js';

export const SalonModule = defineFeatureModule({
  name: 'salon',
  imports: [],
  controllers: [SalonController],
  providers: [AvailabilityConfig, QrService, ResourceRegistration, SalonRegistration, ServiceCatalog],
  exports: [AvailabilityConfig, QrService, ResourceRegistration, SalonRegistration, ServiceCatalog],
  schemas: [SalonSchema],
  dtoPrefix: 'salon.',
  persistence: 'prisma',
} as const);
