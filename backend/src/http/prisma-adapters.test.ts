import { PrismaWaitlistNotifier } from './prisma-adapters';
import type { SmsProvider, SmsTemplateProvider, SmsDeliveryResult } from '../auth/sms-provider.interface';

function createSmsProvider(): SmsProvider & { calls: Array<{ phone: string; message: string }> } {
  const calls: Array<{ phone: string; message: string }> = [];
  return {
    calls,
    async send(phone: string, message: string): Promise<SmsDeliveryResult> {
      calls.push({ phone, message });
      return { ok: true, providerId: 'sms-1' };
    },
  };
}

function createTemplateProvider(): SmsTemplateProvider & {
  calls: Array<{ phone: string; bodyId: number; args: string[] }>;
} {
  const calls: Array<{ phone: string; bodyId: number; args: string[] }> = [];
  return {
    calls,
    async sendTemplate(phone: string, bodyId: number, args: string[]): Promise<SmsDeliveryResult> {
      calls.push({ phone, bodyId, args });
      return { ok: true, providerId: 'template-1' };
    },
  };
}

describe('PrismaWaitlistNotifier', () => {
  it('uses the approved waitlist template and positional service arg', async () => {
    const sms = createSmsProvider();
    const templates = createTemplateProvider();

    await new PrismaWaitlistNotifier(sms, templates).notifyWaitlistCustomer(
      '09120000000',
      'کوتاهی مو',
    );

    expect(templates.calls).toEqual([
      {
        phone: '09120000000',
        bodyId: 525119,
        args: ['کوتاهی مو'],
      },
    ]);
    expect(sms.calls).toHaveLength(0);
  });

  it('keeps direct SMS fallback when shared templates are unavailable', async () => {
    const sms = createSmsProvider();

    await new PrismaWaitlistNotifier(sms).notifyWaitlistCustomer(
      '09120000000',
      'کوتاهی مو',
    );

    expect(sms.calls).toEqual([
      {
        phone: '09120000000',
        message: 'یک نوبت برای کوتاهی مو آزاد شد. برای رزرو اقدام کنید.',
      },
    ]);
  });
});
