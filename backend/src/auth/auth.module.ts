import { defineFeatureModule } from '../common/modules/index.js';
import { AuthController } from './controllers/index.js';
import { AuthSchema } from './schemas/index.js';
import { AuthService, Authorizer } from './services/index.js';

export const AuthModule = defineFeatureModule({
  name: 'auth',
  imports: [],
  controllers: [AuthController],
  providers: [AuthService, Authorizer],
  exports: [AuthService, Authorizer],
  schemas: [AuthSchema],
  dtoPrefix: 'auth.',
  persistence: 'prisma',
} as const);
