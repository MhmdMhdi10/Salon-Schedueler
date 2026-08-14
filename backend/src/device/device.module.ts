import { defineFeatureModule } from '../common/modules/index.js';
import { DeviceController } from './controllers/index.js';
import { DeviceSchema } from './schemas/index.js';
import { NotificationService } from './services/index.js';

export const DeviceModule = defineFeatureModule({
  name: 'device',
  imports: [],
  controllers: [DeviceController],
  providers: [NotificationService],
  exports: [NotificationService],
  schemas: [DeviceSchema],
  dtoPrefix: 'device.',
  persistence: 'prisma',
} as const);
