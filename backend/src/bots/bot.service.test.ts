import { BotService, type BotUpdateHandler } from './bot.service';
import type {
  BotAdapter,
  BotPlatform,
  InboundBotUpdate,
  OutboundBotMessage,
  BotSendResult,
} from './bot-adapter.interface';

/**
 * Unit tests for `Bot_Service.handleUpdate` — the routing/dispatch seam wired in
 * task 7.1. They verify adapter selection, parse → dispatch flow, the no-op
 * default handler, and the never-throw contract that lets the webhook route
 * always answer 200 (Requirements 1.1, 1.6, 8.1).
 */

class FakeAdapter implements BotAdapter {
  readonly enabled = true;
  parseUpdate: jest.Mock<InboundBotUpdate | null, [unknown]>;

  constructor(
    readonly platform: BotPlatform,
    parsed: InboundBotUpdate | null,
  ) {
    this.parseUpdate = jest.fn().mockReturnValue(parsed);
  }

  async send(_message: OutboundBotMessage): Promise<BotSendResult> {
    return { ok: true };
  }
}

function makeHandler(): BotUpdateHandler & { handle: jest.Mock } {
  return { handle: jest.fn().mockResolvedValue(undefined) };
}

describe('BotService.handleUpdate', () => {
  it('selects the matching adapter, parses, and dispatches the update', async () => {
    const update: InboundBotUpdate = {
      platform: 'telegram',
      chatId: '42',
      text: 'سلام',
    };
    const telegram = new FakeAdapter('telegram', update);
    const handler = makeHandler();
    const service = new BotService([telegram], handler);

    const raw = { message: { chat: { id: 42 }, text: 'سلام' } };
    const dispatched = await service.handleUpdate('telegram', raw);

    expect(dispatched).toBe(true);
    expect(telegram.parseUpdate).toHaveBeenCalledWith(raw);
    expect(handler.handle).toHaveBeenCalledTimes(1);
    expect(handler.handle).toHaveBeenCalledWith(update);
  });

  it('routes to the correct platform adapter when several are registered', async () => {
    const baleUpdate: InboundBotUpdate = { platform: 'bale', chatId: '7' };
    const telegram = new FakeAdapter('telegram', null);
    const bale = new FakeAdapter('bale', baleUpdate);
    const handler = makeHandler();
    const service = new BotService([telegram, bale], handler);

    await service.handleUpdate('bale', { any: 'body' });

    expect(bale.parseUpdate).toHaveBeenCalled();
    expect(telegram.parseUpdate).not.toHaveBeenCalled();
    expect(handler.handle).toHaveBeenCalledWith(baleUpdate);
  });

  it('ignores an unknown platform without dispatching', async () => {
    const handler = makeHandler();
    const service = new BotService([new FakeAdapter('telegram', null)], handler);

    const dispatched = await service.handleUpdate('bale', { x: 1 });

    expect(dispatched).toBe(false);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('ignores an unrecognized body that parses to null', async () => {
    const telegram = new FakeAdapter('telegram', null);
    const handler = makeHandler();
    const service = new BotService([telegram], handler);

    const dispatched = await service.handleUpdate('telegram', { junk: true });

    expect(dispatched).toBe(false);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('never throws when the handler rejects (so the webhook can answer 200)', async () => {
    const update: InboundBotUpdate = { platform: 'telegram', chatId: '1' };
    const telegram = new FakeAdapter('telegram', update);
    const handler: BotUpdateHandler = {
      handle: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const service = new BotService([telegram], handler);

    await expect(service.handleUpdate('telegram', {})).resolves.toBe(false);
  });

  it('never throws when an adapter parseUpdate throws', async () => {
    const telegram = new FakeAdapter('telegram', null);
    telegram.parseUpdate.mockImplementation(() => {
      throw new Error('parse failure');
    });
    const service = new BotService([telegram], makeHandler());

    await expect(service.handleUpdate('telegram', {})).resolves.toBe(false);
  });

  it('defaults to a no-op handler that swallows updates without error', async () => {
    const update: InboundBotUpdate = { platform: 'telegram', chatId: '9' };
    const service = new BotService([new FakeAdapter('telegram', update)]);

    await expect(service.handleUpdate('telegram', {})).resolves.toBe(true);
  });
});
