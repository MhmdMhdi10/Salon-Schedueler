import { defineFeatureModule } from '../common/modules/index.js';
import { AdminController } from './controllers/index.js';
import { AdminSchema } from './schemas/index.js';
import { AnalyticsService, AvailabilityConfig, CalendarService, ResourceRegistration, ServiceCatalog } from './services/index.js';

export const AdminModule = defineFeatureModule({
  name: 'admin',
  imports: [],
  controllers: [AdminController],
  providers: [AnalyticsService, CalendarService, AvailabilityConfig, ResourceRegistration, ServiceCatalog],
  exports: [AnalyticsService, CalendarService, AvailabilityConfig, ResourceRegistration, ServiceCatalog],
  schemas: [AdminSchema],
  dtoPrefix: 'admin.',
  persistence: 'prisma',
} as const);
