import { defineFeatureModule } from '../common/modules/index.js';
import { InboxController } from './controllers/index.js';
import { InboxSchema } from './schemas/index.js';
import { SalonInboxService, WsInboxHub } from './services/index.js';

export const InboxModule = defineFeatureModule({
  name: 'inbox',
  imports: [],
  controllers: [InboxController],
  providers: [SalonInboxService, WsInboxHub],
  exports: [SalonInboxService, WsInboxHub],
  schemas: [InboxSchema],
  dtoPrefix: 'inbox.',
  persistence: 'prisma',
} as const);
