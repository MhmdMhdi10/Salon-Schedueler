import fc from 'fast-check';
import { WaitlistService } from './waitlist.service';
import type {
  WaitlistEntry,
  WaitlistRepository,
  WaitlistNotifier,
  JoinWaitlistInput,
} from './waitlist.service';

/**
 * Property Tests — Feature: salon-booking-system
 *
 * Property 13: Waitlist FIFO ordering
 * **Validates: Requirements 13.3, 13.4**
 *
 * For any sequence of customers joining the Waitlist for a window, the stored order
 * equals the join order, and when a (Staff_Member, Chair) pair becomes free the
 * earliest-joined waiting customer is the one notified first.
 */

// ─── In-memory repository implementation for property testing ─────────────────

class InMemoryWaitlistRepository implements WaitlistRepository {
  private entries: WaitlistEntry[] = [];
  private nextId = 1;
  private timeCounter = 0;

  async create(input: JoinWaitlistInput): Promise<WaitlistEntry> {
    const entry: WaitlistEntry = {
      id: `entry-${this.nextId++}`,
      salonId: input.salonId,
      customerId: input.customerId,
      serviceId: input.serviceId,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      status: 'waiting',
      // Monotonically increasing timestamps to ensure FIFO by createdAt
      createdAt: new Date(Date.now() + this.timeCounter++),
    };
    this.entries.push(entry);
    return entry;
  }

  async findWaiting(salonId: string, windowStart: Date, windowEnd: Date): Promise<WaitlistEntry[]> {
    return this.entries
      .filter(
        (e) =>
          e.salonId === salonId &&
          e.status === 'waiting' &&
          e.windowStart.getTime() === windowStart.getTime() &&
          e.windowEnd.getTime() === windowEnd.getTime(),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findById(id: string): Promise<WaitlistEntry | null> {
    return this.entries.find((e) => e.id === id) ?? null;
  }

  async updateStatus(id: string, status: WaitlistEntry['status']): Promise<WaitlistEntry> {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) throw new Error(`Entry ${id} not found`);
    entry.status = status;
    return entry;
  }

  async findCustomerPhone(_customerId: string): Promise<string | null> {
    return '09123456789';
  }

  async findSalonName(_salonId: string): Promise<string | null> {
    return 'آرا';
  }

  /** Expose entries for assertions */
  getEntries(): WaitlistEntry[] {
    return [...this.entries];
  }
}

class MockNotifier implements WaitlistNotifier {
  notifications: { phone: string; salonName: string }[] = [];

  async notifyWaitlistCustomer(phone: string, salonName: string): Promise<void> {
    this.notifications.push({ phone, salonName });
  }
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generate a non-empty array of unique customer IDs (1 to 20 customers) */
const customerIdsArb = fc
  .uniqueArray(fc.uuid(), { minLength: 1, maxLength: 20 })
  .filter((arr) => arr.length >= 1);

const salonIdArb = fc.uuid();
const serviceIdArb = fc.uuid();

// ─── Property 13: Waitlist FIFO ordering ─────────────────────────────────────

describe('Feature: salon-booking-system, Property 13: Waitlist FIFO ordering', () => {
  it('stored ordering equals join order for any sequence of customers', async () => {
    await fc.assert(
      fc.asyncProperty(
        salonIdArb,
        serviceIdArb,
        customerIdsArb,
        async (salonId, serviceId, customerIds) => {
          const repo = new InMemoryWaitlistRepository();
          const notifier = new MockNotifier();
          const service = new WaitlistService(repo, notifier);

          const windowStart = new Date('2024-03-15T10:00:00.000Z');
          const windowEnd = new Date('2024-03-15T11:00:00.000Z');

          // Join customers in the given order
          for (const customerId of customerIds) {
            await service.joinWaitlist({
              salonId,
              customerId,
              serviceId,
              windowStart,
              windowEnd,
            });
          }

          // Get the waitlist — should preserve join order (FIFO)
          const waitlist = await service.getWaitlist(salonId, windowStart, windowEnd);

          // Property: ordering equals join order
          expect(waitlist).toHaveLength(customerIds.length);
          for (let i = 0; i < customerIds.length; i++) {
            expect(waitlist[i].customerId).toBe(customerIds[i]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('earliest-joined customer is notified first when a slot frees', async () => {
    await fc.assert(
      fc.asyncProperty(
        salonIdArb,
        serviceIdArb,
        customerIdsArb,
        async (salonId, serviceId, customerIds) => {
          const repo = new InMemoryWaitlistRepository();
          const notifier = new MockNotifier();
          const service = new WaitlistService(repo, notifier);

          const windowStart = new Date('2024-03-15T10:00:00.000Z');
          const windowEnd = new Date('2024-03-15T11:00:00.000Z');

          // Join customers in the given order
          for (const customerId of customerIds) {
            await service.joinWaitlist({
              salonId,
              customerId,
              serviceId,
              windowStart,
              windowEnd,
            });
          }

          // Notify on free — the earliest-joined customer should be notified
          const notified = await service.notifyOnFree(salonId, windowStart, windowEnd);

          // Property: the earliest-joined (first in the sequence) is notified
          expect(notified).not.toBeNull();
          expect(notified!.customerId).toBe(customerIds[0]);
          expect(notified!.status).toBe('notified');

          // Verify notification was sent
          expect(notifier.notifications.length).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('successive notifyOnFree calls notify customers in FIFO order', async () => {
    await fc.assert(
      fc.asyncProperty(
        salonIdArb,
        serviceIdArb,
        fc.uniqueArray(fc.uuid(), { minLength: 2, maxLength: 10 }),
        async (salonId, serviceId, customerIds) => {
          const repo = new InMemoryWaitlistRepository();
          const notifier = new MockNotifier();
          const service = new WaitlistService(repo, notifier);

          const windowStart = new Date('2024-03-15T10:00:00.000Z');
          const windowEnd = new Date('2024-03-15T11:00:00.000Z');

          // Join all customers
          for (const customerId of customerIds) {
            await service.joinWaitlist({
              salonId,
              customerId,
              serviceId,
              windowStart,
              windowEnd,
            });
          }

          // Repeatedly notify — each time the next in FIFO order should be notified
          const notifiedOrder: string[] = [];
          for (let i = 0; i < customerIds.length; i++) {
            const notified = await service.notifyOnFree(salonId, windowStart, windowEnd);
            if (notified) {
              notifiedOrder.push(notified.customerId);
            } else {
              break;
            }
          }

          // Property: notification order matches join order exactly
          expect(notifiedOrder).toEqual(customerIds);
        },
      ),
      { numRuns: 100 },
    );
  });
});
