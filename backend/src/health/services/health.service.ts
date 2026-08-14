import type { HealthModel } from '../models/index.js';

export class HealthService {
  read(): HealthModel {
    return { status: 'ok' };
  }
}
