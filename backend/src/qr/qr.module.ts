import { defineFeatureModule } from '../common/modules/index.js';
import { QrController } from './controllers/index.js';
import { QrSchema } from './schemas/index.js';
import { QrService } from './services/index.js';

export const QrModule = defineFeatureModule({
  name: 'qr',
  imports: [],
  controllers: [QrController],
  providers: [QrService],
  exports: [QrService],
  schemas: [QrSchema],
  dtoPrefix: 'qr.',
  persistence: 'prisma',
} as const);
