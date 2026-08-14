import { CustomerService } from './customer.service';
import type {
  CustomerRepository,
  AppointmentRecord,
  CustomerNote,
  StaffRef,
} from './customer.service';

/**
 * Unit tests for CustomerService.
 *
 * Requirements: R14.1, R14.2, R14.3, R14.4
 *
 * Tests cover:
 * - getHistory() — returns past appointments for a customer (R14.1)
 * - addNote() — adds a free-text note to a customer profile (R14.2)
 * - getNotes() — returns all notes for a customer (R14.2, R14.4)
 * - getPreferredStaff() — returns the customer's preferred staff (R14.3)
 * - setPreferredStaff() — sets or clears preferred staff
 * - Error cases: customer not found, empty note body
 */

const CUSTOMER_ID = 'customer-1';
const STAFF_ID = 'staff-1';
const AUTHOR_ID = 'author-1';

function createMockRepository(overrides: Partial<CustomerRepository> = {}): CustomerRepository {
  return {
    findById: jest.fn().mockResolvedValue({ id: CUSTOMER_ID, preferredStaffId: null }),
    getProfile: jest.fn().mockResolvedValue({
      id: CUSTOMER_ID,
      phone: '09120000000',
      fullName: null,
    }),
    updateProfile: jest.fn().mockImplementation((customerId: string, fullName: string) =>
      Promise.resolve({ id: customerId, phone: '09120000000', fullName }),
    ),
    getAppointments: jest.fn().mockResolvedValue([]),
    createNote: jest.fn().mockImplementation(
      (customerId: string, authorId: string | null, body: string) =>
        Promise.resolve({
          id: 'note-new',
          customerId,
          authorId,
          body,
          createdAt: new Date('2024-03-15T10:00:00.000Z'),
        }),
    ),
    getNotes: jest.fn().mockResolvedValue([]),
    getPreferredStaff: jest.fn().mockResolvedValue(null),
    setPreferredStaff: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('CustomerService', () => {
  describe('profile', () => {
    it('returns phone and saved name for the authenticated customer', async () => {
      const profile = { id: CUSTOMER_ID, phone: '09120000000', fullName: 'سارا محمدی' };
      const repo = createMockRepository({ getProfile: jest.fn().mockResolvedValue(profile) });
      const service = new CustomerService(repo);

      await expect(service.getProfile(CUSTOMER_ID)).resolves.toEqual(profile);
      expect(repo.getProfile).toHaveBeenCalledWith(CUSTOMER_ID);
    });

    it('trims and persists a valid name', async () => {
      const repo = createMockRepository();
      const service = new CustomerService(repo);

      await service.updateProfile(CUSTOMER_ID, '  سارا محمدی  ');

      expect(repo.updateProfile).toHaveBeenCalledWith(CUSTOMER_ID, 'سارا محمدی');
    });

    it('rejects empty or oversized names', async () => {
      const repo = createMockRepository();
      const service = new CustomerService(repo);

      await expect(service.updateProfile(CUSTOMER_ID, ' ')).rejects.toThrow();
      await expect(service.updateProfile(CUSTOMER_ID, 'x'.repeat(121))).rejects.toThrow();
      expect(repo.updateProfile).not.toHaveBeenCalled();
    });
  });

  describe('getHistory (R14.1)', () => {
    it('returns past appointments for a customer', async () => {
      const appointments: AppointmentRecord[] = [
        {
          id: 'appt-1',
          salonId: 'salon-1',
          serviceId: 'service-1',
          staffMemberId: STAFF_ID,
          chairId: 'chair-1',
          startAt: new Date('2024-03-15T10:00:00.000Z'),
          endAt: new Date('2024-03-15T10:45:00.000Z'),
          status: 'completed',
          source: 'web',
          createdAt: new Date('2024-03-14T08:00:00.000Z'),
        },
        {
          id: 'appt-2',
          salonId: 'salon-1',
          serviceId: 'service-2',
          staffMemberId: 'staff-2',
          chairId: 'chair-2',
          startAt: new Date('2024-03-10T14:00:00.000Z'),
          endAt: new Date('2024-03-10T15:00:00.000Z'),
          status: 'completed',
          source: 'mobile',
          createdAt: new Date('2024-03-09T12:00:00.000Z'),
        },
      ];

      const repo = createMockRepository({
        getAppointments: jest.fn().mockResolvedValue(appointments),
      });
      const service = new CustomerService(repo);

      const result = await service.getHistory(CUSTOMER_ID);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('appt-1');
      expect(result[1].id).toBe('appt-2');
      expect(repo.getAppointments).toHaveBeenCalledWith(CUSTOMER_ID);
    });

    it('returns empty array when customer has no appointments', async () => {
      const repo = createMockRepository({
        getAppointments: jest.fn().mockResolvedValue([]),
      });
      const service = new CustomerService(repo);

      const result = await service.getHistory(CUSTOMER_ID);

      expect(result).toHaveLength(0);
    });

    it('throws if customer not found', async () => {
      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue(null),
      });
      const service = new CustomerService(repo);

      await expect(service.getHistory('nonexistent')).rejects.toThrow(
        'Customer nonexistent not found',
      );
    });
  });

  describe('addNote (R14.2)', () => {
    it('creates a note with the provided body and author', async () => {
      const repo = createMockRepository();
      const service = new CustomerService(repo);

      const result = await service.addNote(CUSTOMER_ID, AUTHOR_ID, 'Customer prefers short hair');

      expect(result.customerId).toBe(CUSTOMER_ID);
      expect(result.authorId).toBe(AUTHOR_ID);
      expect(result.body).toBe('Customer prefers short hair');
      expect(repo.createNote).toHaveBeenCalledWith(
        CUSTOMER_ID,
        AUTHOR_ID,
        'Customer prefers short hair',
      );
    });

    it('allows null authorId', async () => {
      const repo = createMockRepository();
      const service = new CustomerService(repo);

      const result = await service.addNote(CUSTOMER_ID, null, 'Anonymous note');

      expect(result.authorId).toBeNull();
      expect(repo.createNote).toHaveBeenCalledWith(CUSTOMER_ID, null, 'Anonymous note');
    });

    it('trims whitespace from note body', async () => {
      const repo = createMockRepository();
      const service = new CustomerService(repo);

      await service.addNote(CUSTOMER_ID, AUTHOR_ID, '  Likes layers  ');

      expect(repo.createNote).toHaveBeenCalledWith(CUSTOMER_ID, AUTHOR_ID, 'Likes layers');
    });

    it('throws if note body is empty', async () => {
      const repo = createMockRepository();
      const service = new CustomerService(repo);

      await expect(service.addNote(CUSTOMER_ID, AUTHOR_ID, '')).rejects.toThrow(
        'Note body cannot be empty',
      );
    });

    it('throws if note body is only whitespace', async () => {
      const repo = createMockRepository();
      const service = new CustomerService(repo);

      await expect(service.addNote(CUSTOMER_ID, AUTHOR_ID, '   ')).rejects.toThrow(
        'Note body cannot be empty',
      );
    });

    it('throws if customer not found', async () => {
      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue(null),
      });
      const service = new CustomerService(repo);

      await expect(
        service.addNote('nonexistent', AUTHOR_ID, 'Some note'),
      ).rejects.toThrow('Customer nonexistent not found');
    });
  });

  describe('getNotes (R14.2, R14.4)', () => {
    it('returns notes in reverse chronological order', async () => {
      const notes: CustomerNote[] = [
        {
          id: 'note-1',
          customerId: CUSTOMER_ID,
          authorId: AUTHOR_ID,
          body: 'Latest note',
          createdAt: new Date('2024-03-15T12:00:00.000Z'),
        },
        {
          id: 'note-2',
          customerId: CUSTOMER_ID,
          authorId: 'staff-2',
          body: 'Earlier note',
          createdAt: new Date('2024-03-10T08:00:00.000Z'),
        },
      ];

      const repo = createMockRepository({
        getNotes: jest.fn().mockResolvedValue(notes),
      });
      const service = new CustomerService(repo);

      const result = await service.getNotes(CUSTOMER_ID);

      expect(result).toHaveLength(2);
      expect(result[0].body).toBe('Latest note');
      expect(result[1].body).toBe('Earlier note');
      expect(repo.getNotes).toHaveBeenCalledWith(CUSTOMER_ID);
    });

    it('returns empty array when no notes exist', async () => {
      const repo = createMockRepository({
        getNotes: jest.fn().mockResolvedValue([]),
      });
      const service = new CustomerService(repo);

      const result = await service.getNotes(CUSTOMER_ID);

      expect(result).toHaveLength(0);
    });

    it('throws if customer not found', async () => {
      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue(null),
      });
      const service = new CustomerService(repo);

      await expect(service.getNotes('nonexistent')).rejects.toThrow(
        'Customer nonexistent not found',
      );
    });
  });

  describe('getPreferredStaff (R14.3)', () => {
    it('returns the preferred staff member when set', async () => {
      const preferredStaff: StaffRef = {
        id: STAFF_ID,
        fullName: 'Ali',
        role: 'Stylist',
      };

      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue({ id: CUSTOMER_ID, preferredStaffId: STAFF_ID }),
        getPreferredStaff: jest.fn().mockResolvedValue(preferredStaff),
      });
      const service = new CustomerService(repo);

      const result = await service.getPreferredStaff(CUSTOMER_ID);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(STAFF_ID);
      expect(result!.fullName).toBe('Ali');
      expect(result!.role).toBe('Stylist');
    });

    it('returns null when no preferred staff is set', async () => {
      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue({ id: CUSTOMER_ID, preferredStaffId: null }),
      });
      const service = new CustomerService(repo);

      const result = await service.getPreferredStaff(CUSTOMER_ID);

      expect(result).toBeNull();
    });

    it('throws if customer not found', async () => {
      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue(null),
      });
      const service = new CustomerService(repo);

      await expect(service.getPreferredStaff('nonexistent')).rejects.toThrow(
        'Customer nonexistent not found',
      );
    });
  });

  describe('setPreferredStaff', () => {
    it('sets the preferred staff member', async () => {
      const repo = createMockRepository();
      const service = new CustomerService(repo);

      await service.setPreferredStaff(CUSTOMER_ID, STAFF_ID);

      expect(repo.setPreferredStaff).toHaveBeenCalledWith(CUSTOMER_ID, STAFF_ID);
    });

    it('clears the preferred staff when null is provided', async () => {
      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue({ id: CUSTOMER_ID, preferredStaffId: STAFF_ID }),
      });
      const service = new CustomerService(repo);

      await service.setPreferredStaff(CUSTOMER_ID, null);

      expect(repo.setPreferredStaff).toHaveBeenCalledWith(CUSTOMER_ID, null);
    });

    it('throws if customer not found', async () => {
      const repo = createMockRepository({
        findById: jest.fn().mockResolvedValue(null),
      });
      const service = new CustomerService(repo);

      await expect(service.setPreferredStaff('nonexistent', STAFF_ID)).rejects.toThrow(
        'Customer nonexistent not found',
      );
    });
  });
});
