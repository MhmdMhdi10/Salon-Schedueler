import { defineFeatureModule } from '../common/modules/index.js';
import { RegistrationController } from './controllers/index.js';
import { RegistrationSchema } from './schemas/index.js';
import { ResourceRegistration, SalonRegistration } from './services/index.js';

export const RegistrationModule = defineFeatureModule({
  name: 'registration',
  imports: [],
  controllers: [RegistrationController],
  providers: [SalonRegistration, ResourceRegistration],
  exports: [SalonRegistration, ResourceRegistration],
  schemas: [RegistrationSchema],
  dtoPrefix: 'registration.',
  persistence: 'prisma',
} as const);
