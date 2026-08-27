import { WaitlistService } from './waitlist.service';
import type {
  WaitlistEntry,
  WaitlistRepository,
  WaitlistNotifier,
  JoinWaitlistInput,
} from './waitlist.service';

/**
 * Unit tests for WaitlistService
 *
 * Tests cover:
 * - joinWaitlist() — adds a customer to the waitlist (R13.2)
 * - getWaitlist() — returns entries in FIFO order by createdAt (R13.3)
 * - notifyOnFree() — notifies the earliest-joined customer (R13.4)
 * - fulfillEntry() — marks an entry as fulfilled
 * - cancelEntry() — marks an entry as cancelled
 * - Error cases: invalid window, not found, invalid status transitions
 */

const SALON_ID = 'salon-1';
const CUSTOMER_1 = 'customer-1';
const CUSTOMER_2 = 'customer-2';
const CUSTOMER_3 = 'customer-3';
const SERVICE_ID = 'service-1';

function makeEntry(overrides: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    id: 'entry-1',
    salonId: SALON_ID,
    customerId: CUSTOMER_1,
    serviceId: SERVICE_ID,
    windowStart: new Date('2024-03-15T10:00:00.000Z'),
    windowEnd: new Date('2024-03-15T11:00:00.000Z'),
    status: 'waiting',
    createdAt: new Date('2024-03-15T08:00:00.000Z'),
    ...overrides,
  };
}

function createMockRepository(
  overrides: Partial<WaitlistRepository> = {},
): WaitlistRepository {
  return {
    create: jest.fn().mockImplementation((input: JoinWaitlistInput) =>
      Promise.resolve({
        id: 'entry-new',
        ...input,
        status: 'waiting' as const,
        createdAt: new Date(),
      }),
    ),
    findWaiting: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    updateStatus: jest.fn().mockImplementation((id: string, status: string) =>
      Promise.resolve({ ...makeEntry({ id }), status } as WaitlistEntry),
    ),
    findCustomerPhone: jest.fn().mockResolvedValue('09123456789'),
    findSalonName: jest.fn().mockResolvedValue('آرا'),
    ...overrides,
  };
}

function createMockNotifier(): WaitlistNotifier {
  return {
    notifyWaitlistCustomer: jest.fn().mockResolvedValue(undefined),
  };
}

describe('WaitlistService', () => {
  describe('joinWaitlist', () => {
    it('creates a waitlist entry for a customer (R13.2)', async () => {
      const repo = createMockRepository();
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      const input: JoinWaitlistInput = {
        salonId: SALON_ID,
        customerId: CUSTOMER_1,
        serviceId: SERVICE_ID,
        windowStart: new Date('2024-03-15T10:00:00.000Z'),
        windowEnd: new Date('2024-03-15T11:00:00.000Z'),
      };

      const result = await service.joinWaitlist(input);

      expect(repo.create).toHaveBeenCalledWith(input);
      expect(result.salonId).toBe(SALON_ID);
      expect(result.customerId).toBe(CUSTOMER_1);
      expect(result.serviceId).toBe(SERVICE_ID);
      expect(result.status).toBe('waiting');
    });

    it('throws if windowEnd is not after windowStart', async () => {
      const repo = createMockRepository();
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      const input: JoinWaitlistInput = {
        salonId: SALON_ID,
        customerId: CUSTOMER_1,
        serviceId: SERVICE_ID,
        windowStart: new Date('2024-03-15T11:00:00.000Z'),
        windowEnd: new Date('2024-03-15T10:00:00.000Z'),
      };

      await expect(service.joinWaitlist(input)).rejects.toThrow(
        'windowEnd must be after windowStart',
      );
    });

    it('throws if windowEnd equals windowStart', async () => {
      const repo = createMockRepository();
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      const sameTime = new Date('2024-03-15T10:00:00.000Z');
      const input: JoinWaitlistInput = {
        salonId: SALON_ID,
        customerId: CUSTOMER_1,
        serviceId: SERVICE_ID,
        windowStart: sameTime,
        windowEnd: sameTime,
      };

      await expect(service.joinWaitlist(input)).rejects.toThrow(
        'windowEnd must be after windowStart',
      );
    });
  });

  describe('getWaitlist', () => {
    it('returns entries in FIFO order by createdAt (R13.3)', async () => {
      const entries: WaitlistEntry[] = [
        makeEntry({ id: 'entry-1', customerId: CUSTOMER_1, createdAt: new Date('2024-03-15T08:00:00.000Z') }),
        makeEntry({ id: 'entry-2', customerId: CUSTOMER_2, createdAt: new Date('2024-03-15T08:05:00.000Z') }),
        makeEntry({ id: 'entry-3', customerId: CUSTOMER_3, createdAt: new Date('2024-03-15T08:10:00.000Z') }),
      ];

      const repo = createMockRepository({
        findWaiting: jest.fn().mockResolvedValue(entries),
      });
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      const windowStart = new Date('2024-03-15T10:00:00.000Z');
      const windowEnd = new Date('2024-03-15T11:00:00.000Z');

      const result = await service.getWaitlist(SALON_ID, windowStart, windowEnd);

      expect(result).toHaveLength(3);
      expect(result[0].customerId).toBe(CUSTOMER_1);
      expect(result[1].customerId).toBe(CUSTOMER_2);
      expect(result[2].customerId).toBe(CUSTOMER_3);
      expect(repo.findWaiting).toHaveBeenCalledWith(SALON_ID, windowStart, windowEnd);
    });

    it('returns empty array when no one is waiting', async () => {
      const repo = createMockRepository({
        findWaiting: jest.fn().mockResolvedValue([]),
      });
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      const result = await service.getWaitlist(
        SALON_ID,
        new Date('2024-03-15T10:00:00.000Z'),
        new Date('2024-03-15T11:00:00.000Z'),
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('notifyOnFree', () => {
    it('notifies the earliest-joined waiting customer first (R13.4)', async () => {
      const entries: WaitlistEntry[] = [
        makeEntry({ id: 'entry-1', customerId: CUSTOMER_1, createdAt: new Date('2024-03-15T08:00:00.000Z') }),
        makeEntry({ id: 'entry-2', customerId: CUSTOMER_2, createdAt: new Date('2024-03-15T08:05:00.000Z') }),
      ];

      const repo = createMockRepository({
        findWaiting: jest.fn().mockResolvedValue(entries),
        updateStatus: jest.fn().mockImplementation((id: string, status: string) =>
          Promise.resolve({ ...entries.find((e) => e.id === id)!, status } as WaitlistEntry),
        ),
        findCustomerPhone: jest.fn().mockResolvedValue('09123456789'),
        findSalonName: jest.fn().mockResolvedValue('آرا'),
      });
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      const windowStart = new Date('2024-03-15T10:00:00.000Z');
      const windowEnd = new Date('2024-03-15T11:00:00.000Z');

      const result = await service.notifyOnFree(SALON_ID, windowStart, windowEnd);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('entry-1');
      expect(result!.status).toBe('notified');
      expect(repo.updateStatus).toHaveBeenCalledWith('entry-1', 'notified');
      expect(notifier.notifyWaitlistCustomer).toHaveBeenCalledWith(
        '09123456789',
        'آرا',
      );
    });

    it('returns null when no one is waiting', async () => {
      const repo = createMockRepository({
        findWaiting: jest.fn().mockResolvedValue([]),
      });
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      const result = await service.notifyOnFree(
        SALON_ID,
        new Date('2024-03-15T10:00:00.000Z'),
        new Date('2024-03-15T11:00:00.000Z'),
      );

      expect(result).toBeNull();
      expect(notifier.notifyWaitlistCustomer).not.toHaveBeenCalled();
    });

    it('does not notify if customer phone is not found', async () => {
      const entries: WaitlistEntry[] = [
        makeEntry({ id: 'entry-1', customerId: CUSTOMER_1 }),
      ];

      const repo = createMockRepository({
        findWaiting: jest.fn().mockResolvedValue(entries),
        findCustomerPhone: jest.fn().mockResolvedValue(null),
      });
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      const result = await service.notifyOnFree(
        SALON_ID,
        new Date('2024-03-15T10:00:00.000Z'),
        new Date('2024-03-15T11:00:00.000Z'),
      );

      // Status still updated to 'notified' even if notification can't be sent
      expect(result).not.toBeNull();
      expect(repo.updateStatus).toHaveBeenCalledWith('entry-1', 'notified');
      expect(notifier.notifyWaitlistCustomer).not.toHaveBeenCalled();
    });

    it('uses default salon name when salon name not found', async () => {
      const entries: WaitlistEntry[] = [
        makeEntry({ id: 'entry-1', customerId: CUSTOMER_1 }),
      ];

      const repo = createMockRepository({
        findWaiting: jest.fn().mockResolvedValue(entries),
        findCustomerPhone: jest.fn().mockResolvedValue('09123456789'),
        findSalonName: jest.fn().mockResolvedValue(null),
      });
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      await service.notifyOnFree(
        SALON_ID,
        new Date('2024-03-15T10:00:00.000Z'),
        new Date('2024-03-15T11:00:00.000Z'),
      );

      expect(notifier.notifyWaitlistCustomer).toHaveBeenCalledWith(
        '09123456789',
        'آرا',
      );
    });
  });

  describe('fulfillEntry', () => {
    it('marks a waiting entry as fulfilled', async () => {
      const entry = makeEntry({ id: 'entry-1', status: 'waiting' });
      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue(entry),
        updateStatus: jest.fn().mockResolvedValue({ ...entry, status: 'fulfilled' }),
      });
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      const result = await service.fulfillEntry('entry-1');

      expect(result.status).toBe('fulfilled');
      expect(repo.updateStatus).toHaveBeenCalledWith('entry-1', 'fulfilled');
    });

    it('marks a notified entry as fulfilled', async () => {
      const entry = makeEntry({ id: 'entry-1', status: 'notified' });
      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue(entry),
        updateStatus: jest.fn().mockResolvedValue({ ...entry, status: 'fulfilled' }),
      });
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      const result = await service.fulfillEntry('entry-1');

      expect(result.status).toBe('fulfilled');
    });

    it('throws if entry not found', async () => {
      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue(null),
      });
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      await expect(service.fulfillEntry('nonexistent')).rejects.toThrow(
        'Waitlist entry nonexistent not found',
      );
    });

    it('throws if entry is already cancelled', async () => {
      const entry = makeEntry({ id: 'entry-1', status: 'cancelled' });
      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue(entry),
      });
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      await expect(service.fulfillEntry('entry-1')).rejects.toThrow(
        "cannot be fulfilled: current status is 'cancelled'",
      );
    });

    it('throws if entry is already fulfilled', async () => {
      const entry = makeEntry({ id: 'entry-1', status: 'fulfilled' });
      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue(entry),
      });
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      await expect(service.fulfillEntry('entry-1')).rejects.toThrow(
        "cannot be fulfilled: current status is 'fulfilled'",
      );
    });
  });

  describe('cancelEntry', () => {
    it('marks a waiting entry as cancelled', async () => {
      const entry = makeEntry({ id: 'entry-1', status: 'waiting' });
      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue(entry),
        updateStatus: jest.fn().mockResolvedValue({ ...entry, status: 'cancelled' }),
      });
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      const result = await service.cancelEntry('entry-1');

      expect(result.status).toBe('cancelled');
      expect(repo.updateStatus).toHaveBeenCalledWith('entry-1', 'cancelled');
    });

    it('marks a notified entry as cancelled', async () => {
      const entry = makeEntry({ id: 'entry-1', status: 'notified' });
      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue(entry),
        updateStatus: jest.fn().mockResolvedValue({ ...entry, status: 'cancelled' }),
      });
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      const result = await service.cancelEntry('entry-1');

      expect(result.status).toBe('cancelled');
    });

    it('throws if entry not found', async () => {
      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue(null),
      });
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      await expect(service.cancelEntry('nonexistent')).rejects.toThrow(
        'Waitlist entry nonexistent not found',
      );
    });

    it('throws if entry is already fulfilled', async () => {
      const entry = makeEntry({ id: 'entry-1', status: 'fulfilled' });
      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue(entry),
      });
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      await expect(service.cancelEntry('entry-1')).rejects.toThrow(
        "cannot be cancelled: current status is 'fulfilled'",
      );
    });

    it('throws if entry is already cancelled', async () => {
      const entry = makeEntry({ id: 'entry-1', status: 'cancelled' });
      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue(entry),
      });
      const notifier = createMockNotifier();
      const service = new WaitlistService(repo, notifier);

      await expect(service.cancelEntry('entry-1')).rejects.toThrow(
        "cannot be cancelled: current status is 'cancelled'",
      );
    });
  });
});
