import { defineFeatureModule } from '../common/modules/index.js';
import { BotController } from './controllers/index.js';
import { BotSchema } from './schemas/index.js';
import { BotService } from './services/index.js';

export const BotModule = defineFeatureModule({
  name: 'bot',
  imports: [],
  controllers: [BotController],
  providers: [BotService],
  exports: [BotService],
  schemas: [BotSchema],
  dtoPrefix: 'bot.',
  persistence: 'prisma',
} as const);
