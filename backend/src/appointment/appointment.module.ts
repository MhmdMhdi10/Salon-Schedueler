import { defineFeatureModule } from '../common/modules/index.js';
import { AppointmentController } from './controllers/index.js';
import { AppointmentSchema } from './schemas/index.js';
import { AppointmentManagementService, BookingFlow, CancellationFlow } from './services/index.js';

export const AppointmentModule = defineFeatureModule({
  name: 'appointment',
  imports: [],
  controllers: [AppointmentController],
  providers: [AppointmentManagementService, BookingFlow, CancellationFlow],
  exports: [AppointmentManagementService, BookingFlow, CancellationFlow],
  schemas: [AppointmentSchema],
  dtoPrefix: 'appointment.',
  persistence: 'prisma',
} as const);
