/**
 * Migration / Constraint Tests — Salon Platform Expansion (Task 1.3)
 *
 * These tests validate the additive data model introduced by migration
 * `00000000000002_salon_platform_expansion`:
 *   - The new enums exist (BotPlatform, SubscriptionStatus, SubscriptionPlanKind)
 *     and ApptSource gained the 'bot' value.
 *   - The new tables exist (bot_chat, bot_session, subscription,
 *     subscription_payment, qr_scan_event).
 *   - The unique constraint BotChat(platform, chat_id) holds — a duplicate insert fails.
 *   - The unique constraint Subscription(salon_id) holds — one subscription per salon.
 *
 * Requirements: 1.6, 3.1
 *
 * Prerequisites:
 *   - DATABASE_URL must be set (pointing to a PostgreSQL database)
 *   - The database must have migrations applied (prisma migrate deploy)
 *
 * Gating: These tests are opt-in. They run only when DATABASE_URL is set; otherwise
 * the whole suite is reported as skipped (not errored). The PrismaClient is never
 * constructed at module load — it is created lazily inside the guarded beforeAll, so
 * an unset DATABASE_URL cannot throw a PrismaClientInitializationError at import time.
 */

import { PrismaClient } from '@prisma/client';

// Run the DB-dependent suite only when a database is configured; otherwise skip it.
const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

// Helper to generate a UUID (v4-like) for test data
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

describeIfDb('salon platform expansion migration (opt-in: requires DATABASE_URL)', () => {
  // Constructed lazily inside beforeAll so module load never instantiates a Prisma
  // client when DATABASE_URL is unset.
  let prisma: PrismaClient;

  // Shared salons created per-test get cleaned up; track them here.
  const createdSalonIds: string[] = [];

  async function createSalon(): Promise<string> {
    const salonId = uuid();
    await prisma.$executeRaw`
      INSERT INTO salon (id, name, qr_token, timezone, created_at)
      VALUES (${salonId}::uuid, 'Migration Test Salon', ${uuid()}, 'Asia/Tehran', NOW())
    `;
    createdSalonIds.push(salonId);
    return salonId;
  }

  async function createCustomer(): Promise<string> {
    const customerId = uuid();
    // Phone must be unique; derive from the generated uuid digits.
    const phone = '0912' + Math.floor(Math.random() * 1_000_0000).toString().padStart(7, '0');
    await prisma.$executeRaw`
      INSERT INTO customer (id, phone, full_name, no_show_count)
      VALUES (${customerId}::uuid, ${phone}, 'Migration Test Customer', 0)
    `;
    return customerId;
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    // Clean up dependents then salons in FK-safe order.
    await prisma.$executeRaw`DELETE FROM bot_chat WHERE customer_id IN (SELECT id FROM customer WHERE full_name = 'Migration Test Customer')`;
    for (const salonId of createdSalonIds) {
      await prisma.$executeRaw`DELETE FROM subscription_payment WHERE subscription_id IN (SELECT id FROM subscription WHERE salon_id = ${salonId}::uuid)`;
      await prisma.$executeRaw`DELETE FROM subscription WHERE salon_id = ${salonId}::uuid`;
      await prisma.$executeRaw`DELETE FROM qr_scan_event WHERE salon_id = ${salonId}::uuid`;
      await prisma.$executeRaw`DELETE FROM salon WHERE id = ${salonId}::uuid`;
    }
    await prisma.$executeRaw`DELETE FROM customer WHERE full_name = 'Migration Test Customer'`;
    await prisma.$disconnect();
  });

  // ─── New tables exist ────────────────────────────────────────────────────────

  describe('new tables exist', () => {
    it.each([
      'bot_chat',
      'bot_session',
      'subscription',
      'subscription_payment',
      'qr_scan_event',
    ])('table "%s" exists in the public schema', async (tableName) => {
      const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = ${tableName}
        ) AS exists
      `;
      expect(rows[0]?.exists).toBe(true);
    });
  });

  // ─── New enums exist ─────────────────────────────────────────────────────────

  describe('new enums exist with expected values', () => {
    async function enumValues(typeName: string): Promise<string[]> {
      const rows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
        SELECT e.enumlabel
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = ${typeName}
        ORDER BY e.enumsortorder
      `;
      return rows.map((r) => r.enumlabel);
    }

    it('BotPlatform enum has telegram and bale', async () => {
      const values = await enumValues('BotPlatform');
      expect(values).toEqual(expect.arrayContaining(['telegram', 'bale']));
    });

    it('SubscriptionStatus enum has trial/active/grace/expired', async () => {
      const values = await enumValues('SubscriptionStatus');
      expect(values).toEqual(expect.arrayContaining(['trial', 'active', 'grace', 'expired']));
    });

    it('SubscriptionPlanKind enum has trial/monthly/quarterly/annual', async () => {
      const values = await enumValues('SubscriptionPlanKind');
      expect(values).toEqual(
        expect.arrayContaining(['trial', 'monthly', 'quarterly', 'annual'])
      );
    });

    it("ApptSource enum gained the 'bot' value", async () => {
      const values = await enumValues('ApptSource');
      expect(values).toContain('bot');
    });
  });

  // ─── Unique constraint: BotChat(platform, chatId) (R1.6) ───────────────────────

  describe('unique constraint bot_chat(platform, chat_id) (R1.6)', () => {
    async function insertBotChat(platform: string, chatId: string, customerId: string): Promise<void> {
      await prisma.$executeRaw`
        INSERT INTO bot_chat (id, platform, chat_id, customer_id, linked_at)
        VALUES (${uuid()}::uuid, ${platform}::"BotPlatform", ${chatId}, ${customerId}::uuid, NOW())
      `;
    }

    it('rejects a duplicate (platform, chat_id) pair', async () => {
      const customerId = await createCustomer();
      const chatId = 'chat-' + uuid();

      await insertBotChat('telegram', chatId, customerId);

      // Same (platform, chatId) must fail the unique index.
      await expect(insertBotChat('telegram', chatId, customerId)).rejects.toThrow();
    });

    it('allows the same chat_id on different platforms', async () => {
      const customerId = await createCustomer();
      const chatId = 'chat-' + uuid();

      await insertBotChat('telegram', chatId, customerId);

      // Different platform, same chatId — should succeed (composite uniqueness).
      await expect(insertBotChat('bale', chatId, customerId)).resolves.toBeUndefined();
    });
  });

  // ─── Unique constraint: Subscription(salonId) (R3.1) ───────────────────────────

  describe('unique constraint subscription(salon_id) (R3.1)', () => {
    async function insertSubscription(salonId: string): Promise<void> {
      await prisma.$executeRaw`
        INSERT INTO subscription (id, salon_id, status, plan_kind, started_at, expires_at, created_at)
        VALUES (
          ${uuid()}::uuid,
          ${salonId}::uuid,
          'trial'::"SubscriptionStatus",
          'trial'::"SubscriptionPlanKind",
          NOW(),
          NOW() + INTERVAL '14 days',
          NOW()
        )
      `;
    }

    it('rejects a second subscription for the same salon', async () => {
      const salonId = await createSalon();

      await insertSubscription(salonId);

      // One subscription per salon — second insert must fail.
      await expect(insertSubscription(salonId)).rejects.toThrow();
    });

    it('allows one subscription each for different salons', async () => {
      const salonA = await createSalon();
      const salonB = await createSalon();

      await insertSubscription(salonA);
      await expect(insertSubscription(salonB)).resolves.toBeUndefined();
    });
  });
});
