import { defineFeatureModule } from '../common/modules/index.js';
import { PlatformAdminController } from './controllers/index.js';
import { PlatformAdminSchema } from './schemas/index.js';
import { PlatformAdminService } from './services/index.js';

export const PlatformAdminModule = defineFeatureModule({
  name: 'platform-admin',
  imports: [],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService],
  exports: [PlatformAdminService],
  schemas: [PlatformAdminSchema],
  dtoPrefix: 'platform-admin.',
  persistence: 'prisma',
} as const);
