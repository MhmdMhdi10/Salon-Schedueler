import { randomUUID } from 'node:crypto';
import type { CardOrderModel } from '../models/index.js';

export interface CardOrderInput {
  readonly template: string;
  readonly quantity: number;
  readonly contactName: string;
  readonly phone: string;
  readonly address: string;
}

export class CardOrderService {
  create(_input: CardOrderInput): CardOrderModel {
    return { orderId: `CARD-${randomUUID().slice(0, 8).toUpperCase()}`, status: 'received' };
  }
}
