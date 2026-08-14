import { BotChannel } from './bot-channel';
import type {
  BotChannelRepository,
  BotChatRef,
  BotRecipient,
} from './bot-channel';
import type { NotificationLogEntry } from './notification.service';
import type {
  BotAdapter,
  BotPlatform,
  BotSendResult,
  OutboundBotMessage,
} from '../bots/bot-adapter.interface';
import type { SmsProvider, SmsDeliveryResult } from '../auth/sms-provider.interface';

/**
 * Unit tests for `Bot_Channel`.
 *
 * Validates: Requirements 1.3, 1.4, 1.5, 1.9, 1.10
 *
 * Covers: routing OTP/reminder/owner-notice through a linked bot chat; falling
 * back to SMS when no `BotChat` exists, the adapter is disabled, or the bot send
 * fails; logging each attempt to `NotificationLog` with the right channel/status;
 * and that no OTP/token values leak into log rows.
 */

// ─── Test Helpers ──────────────────────────────────────────────────────────────

function createMockSmsProvider(
  result?: SmsDeliveryResult,
): SmsProvider & { calls: { phone: string; message: string }[] } {
  const calls: { phone: string; message: string }[] = [];
  return {
    calls,
    async send(phone: string, message: string): Promise<SmsDeliveryResult> {
      calls.push({ phone, message });
      return result ?? { ok: true, providerId: 'sms-123' };
    },
  };
}

function createMockAdapter(
  platform: BotPlatform,
  opts?: { enabled?: boolean; result?: BotSendResult },
): BotAdapter & { calls: OutboundBotMessage[] } {
  const calls: OutboundBotMessage[] = [];
  return {
    platform,
    enabled: opts?.enabled ?? true,
    calls,
    async send(message: OutboundBotMessage): Promise<BotSendResult> {
      calls.push(message);
      return opts?.result ?? { ok: true };
    },
    parseUpdate() {
      return null;
    },
  };
}

function createMockRepository(
  botChat: BotChatRef | null,
): BotChannelRepository & {
  logs: Omit<NotificationLogEntry, 'id' | 'createdAt'>[];
} {
  const logs: Omit<NotificationLogEntry, 'id' | 'createdAt'>[] = [];
  let counter = 0;
  return {
    logs,
    async findBotChat(): Promise<BotChatRef | null> {
      return botChat;
    },
    async logNotification(entry): Promise<NotificationLogEntry> {
      logs.push(entry);
      counter++;
      return { id: `log-${counter}`, ...entry, createdAt: new Date() };
    },
  };
}

const customer: BotRecipient = {
  kind: 'customer',
  customerId: 'cust-1',
  phone: '+989121234567',
};

const owner: BotRecipient = {
  kind: 'staff',
  staffMemberId: 'staff-1',
  phone: '+989120000000',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BotChannel', () => {
  describe('routes through the bot when a BotChat exists (R1.3, R1.4, R1.5)', () => {
    it('delivers OTP through the linked telegram chat and logs sent (R1.3, R1.10)', async () => {
      const adapter = createMockAdapter('telegram');
      const sms = createMockSmsProvider();
      const repo = createMockRepository({ platform: 'telegram', chatId: 'chat-42' });

      const channel = new BotChannel([adapter], sms, repo);
      const result = await channel.sendOtp(customer, 'کد تأیید شما: 123456');

      expect(result).toEqual({
        ok: true,
        channel: 'telegram',
        attemptedBot: true,
        fellBackToSms: false,
      });
      expect(adapter.calls).toHaveLength(1);
      expect(adapter.calls[0].chatId).toBe('chat-42');
      expect(sms.calls).toHaveLength(0);
      expect(repo.logs).toHaveLength(1);
      expect(repo.logs[0]).toMatchObject({
        appointmentId: null,
        channel: 'telegram',
        status: 'sent',
        error: null,
      });
    });

    it('delivers a reminder through a linked bale chat (R1.4)', async () => {
      const telegram = createMockAdapter('telegram');
      const bale = createMockAdapter('bale');
      const sms = createMockSmsProvider();
      const repo = createMockRepository({ platform: 'bale', chatId: 'bale-7' });

      const channel = new BotChannel([telegram, bale], sms, repo);
      const result = await channel.sendReminder(customer, 'یادآوری نوبت', {
        appointmentId: 'appt-9',
      });

      expect(result.channel).toBe('bale');
      expect(bale.calls).toHaveLength(1);
      expect(telegram.calls).toHaveLength(0);
      expect(repo.logs[0]).toMatchObject({
        appointmentId: 'appt-9',
        channel: 'bale',
        status: 'sent',
      });
    });

    it('delivers an owner new-booking notice through the bot (R1.5)', async () => {
      const adapter = createMockAdapter('telegram');
      const sms = createMockSmsProvider();
      const repo = createMockRepository({ platform: 'telegram', chatId: 'owner-chat' });

      const channel = new BotChannel([adapter], sms, repo);
      const result = await channel.sendOwnerNotice(owner, 'رزرو جدید ثبت شد', {
        appointmentId: 'appt-1',
      });

      expect(result.ok).toBe(true);
      expect(result.channel).toBe('telegram');
      expect(adapter.calls[0].chatId).toBe('owner-chat');
      expect(sms.calls).toHaveLength(0);
    });
  });

  describe('falls back to SMS (R1.9)', () => {
    it('falls back to SMS when no BotChat exists', async () => {
      const adapter = createMockAdapter('telegram');
      const sms = createMockSmsProvider({ ok: true, providerId: 'sms-ok' });
      const repo = createMockRepository(null);

      const channel = new BotChannel([adapter], sms, repo);
      const result = await channel.sendOtp(customer, 'کد تأیید شما: 654321');

      expect(result).toEqual({
        ok: true,
        channel: 'sms',
        attemptedBot: false,
        fellBackToSms: true,
      });
      expect(adapter.calls).toHaveLength(0);
      expect(sms.calls).toHaveLength(1);
      expect(sms.calls[0].phone).toBe('+989121234567');
      // Only the SMS attempt is logged (no bot attempt occurred).
      expect(repo.logs).toHaveLength(1);
      expect(repo.logs[0]).toMatchObject({ channel: 'sms', status: 'sent' });
    });

    it('falls back to SMS when the adapter for the chat is disabled (no token)', async () => {
      const adapter = createMockAdapter('telegram', { enabled: false });
      const sms = createMockSmsProvider();
      const repo = createMockRepository({ platform: 'telegram', chatId: 'chat-1' });

      const channel = new BotChannel([adapter], sms, repo);
      const result = await channel.sendReminder(customer, 'یادآوری');

      expect(result.attemptedBot).toBe(false);
      expect(result.channel).toBe('sms');
      expect(adapter.calls).toHaveLength(0);
      expect(sms.calls).toHaveLength(1);
      expect(repo.logs).toHaveLength(1);
      expect(repo.logs[0]).toMatchObject({ channel: 'sms', status: 'sent' });
    });

    it('falls back to SMS and logs both attempts when the bot send fails (R1.9)', async () => {
      const adapter = createMockAdapter('telegram', {
        result: { ok: false, error: 'telegram HTTP 500' },
      });
      const sms = createMockSmsProvider({ ok: true, providerId: 'sms-ok' });
      const repo = createMockRepository({ platform: 'telegram', chatId: 'chat-1' });

      const channel = new BotChannel([adapter], sms, repo);
      const result = await channel.sendOtp(customer, 'کد تأیید شما: 111222');

      expect(result).toEqual({
        ok: true,
        channel: 'sms',
        attemptedBot: true,
        fellBackToSms: true,
      });
      expect(adapter.calls).toHaveLength(1);
      expect(sms.calls).toHaveLength(1);

      // Both the failed bot attempt and the successful SMS fallback are logged.
      expect(repo.logs).toHaveLength(2);
      expect(repo.logs[0]).toMatchObject({
        channel: 'telegram',
        status: 'failed',
        error: 'telegram HTTP 500',
      });
      expect(repo.logs[1]).toMatchObject({ channel: 'sms', status: 'sent' });
    });

    it('reports ok=false when both bot and SMS fail', async () => {
      const adapter = createMockAdapter('telegram', {
        result: { ok: false, error: 'bot down' },
      });
      const sms = createMockSmsProvider({ ok: false, error: 'sms down' });
      const repo = createMockRepository({ platform: 'telegram', chatId: 'chat-1' });

      const channel = new BotChannel([adapter], sms, repo);
      const result = await channel.sendReminder(customer, 'یادآوری');

      expect(result.ok).toBe(false);
      expect(result.fellBackToSms).toBe(true);
      expect(repo.logs).toHaveLength(2);
      expect(repo.logs[0]).toMatchObject({ channel: 'telegram', status: 'failed' });
      expect(repo.logs[1]).toMatchObject({ channel: 'sms', status: 'failed' });
    });
  });

  describe('no secret/token leakage in logs (R8.1)', () => {
    it('does not store the OTP code or message body in any log row', async () => {
      const otpCode = '987654';
      const otpMessage = `کد تأیید شما: ${otpCode}`;

      // Exercise both the bot path and the SMS fallback path.
      const failingAdapter = createMockAdapter('telegram', {
        result: { ok: false, error: 'telegram rejected' },
      });
      const sms = createMockSmsProvider();
      const repo = createMockRepository({ platform: 'telegram', chatId: 'chat-1' });

      const channel = new BotChannel([failingAdapter], sms, repo);
      await channel.sendOtp(customer, otpMessage);

      const serialized = JSON.stringify(repo.logs);
      expect(serialized).not.toContain(otpCode);
      expect(serialized).not.toContain(otpMessage);
      // The error field carries only the transport error, never the payload.
      for (const log of repo.logs) {
        if (log.error) {
          expect(log.error).not.toContain(otpCode);
        }
      }
    });

    it('never places the bot chat id in the log rows', async () => {
      const adapter = createMockAdapter('telegram');
      const sms = createMockSmsProvider();
      const repo = createMockRepository({ platform: 'telegram', chatId: 'secret-chat-id' });

      const channel = new BotChannel([adapter], sms, repo);
      await channel.sendOtp(customer, 'کد تأیید شما: 000111');

      expect(JSON.stringify(repo.logs)).not.toContain('secret-chat-id');
    });
  });
});
