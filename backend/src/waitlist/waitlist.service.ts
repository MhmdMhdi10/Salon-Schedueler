/**
 * Minimal notification port for the waitlist service.
 * The waitlist service only needs to send a "slot freed" notification to a customer.
 */
export interface WaitlistNotifier {
  /** Notify a customer that a waitlisted slot has become available. */
  notifyWaitlistCustomer(phone: string, salonName: string): Promise<void>;
}

/**
 * Represents a waitlist entry stored in the database.
 */
export interface WaitlistEntry {
  id: string;
  salonId: string;
  customerId: string;
  serviceId: string;
  windowStart: Date;
  windowEnd: Date;
  status: 'waiting' | 'notified' | 'fulfilled' | 'cancelled';
  createdAt: Date;
}

/**
 * Input for joining the waitlist.
 */
export interface JoinWaitlistInput {
  salonId: string;
  customerId: string;
  serviceId: string;
  windowStart: Date;
  windowEnd: Date;
}

/**
 * Repository port for waitlist data access.
 * Abstracted from Prisma so tests can supply in-memory fakes.
 */
export interface WaitlistRepository {
  /** Create a new waitlist entry and return it with a generated id and createdAt. */
  create(input: JoinWaitlistInput): Promise<WaitlistEntry>;

  /** Find all waiting entries for a given salon and overlapping time window, ordered by createdAt ASC (FIFO). */
  findWaiting(salonId: string, windowStart: Date, windowEnd: Date): Promise<WaitlistEntry[]>;

  /** Find a single entry by ID. */
  findById(id: string): Promise<WaitlistEntry | null>;

  /** Return an existing active entry for the same customer/window, when supported. */
  findActiveForCustomer?(input: JoinWaitlistInput): Promise<WaitlistEntry | null>;

  /** Return a customer's entries for the account surface, when supported. */
  findByCustomer?(customerId: string): Promise<WaitlistEntry[]>;

  /** Update the status of a waitlist entry. */
  updateStatus(id: string, status: WaitlistEntry['status']): Promise<WaitlistEntry>;

  /** Find the customer phone by customer ID (for notifications). */
  findCustomerPhone(customerId: string): Promise<string | null>;

  /** Find the salon name by salon ID (for notification messages). */
  findSalonName(salonId: string): Promise<string | null>;
}

/**
 * WaitlistService — manages the waitlist for fully booked time windows.
 *
 * - `joinWaitlist` — adds a customer to the waitlist for a given time window (R13.2)
 * - `getWaitlist` — returns the waitlist entries in FIFO order by createdAt (R13.3)
 * - `notifyOnFree` — notifies the earliest-joined waiting customer when a slot frees (R13.4)
 * - `fulfillEntry` — marks an entry as fulfilled (customer booked the freed slot)
 * - `cancelEntry` — marks an entry as cancelled (customer no longer wants to wait)
 *
 * Requirements: R13.2, R13.3, R13.4
 */
export class WaitlistService {
  private readonly repository: WaitlistRepository;
  private readonly notifier: WaitlistNotifier;

  constructor(
    repository: WaitlistRepository,
    notifier: WaitlistNotifier,
  ) {
    this.repository = repository;
    this.notifier = notifier;
  }

  /**
   * Add a customer to the waitlist for a fully booked time window.
   *
   * Requirements: R13.2
   *
   * @param input - The waitlist entry details (salon, customer, service, time window)
   * @returns The created waitlist entry
   */
  async joinWaitlist(input: JoinWaitlistInput): Promise<WaitlistEntry> {
    if (
      Number.isNaN(input.windowStart.getTime()) ||
      Number.isNaN(input.windowEnd.getTime()) ||
      input.windowEnd <= input.windowStart
    ) {
      throw new Error('windowEnd must be after windowStart');
    }

    const existing = await this.repository.findActiveForCustomer?.(input);
    if (existing) return existing;

    const entry = await this.repository.create(input);
    return entry;
  }

  /** Fetch one entry so HTTP callers can enforce customer ownership. */
  async getEntry(entryId: string): Promise<WaitlistEntry | null> {
    return this.repository.findById(entryId);
  }

  /** List the authenticated customer's waitlist entries. */
  async getCustomerEntries(customerId: string): Promise<WaitlistEntry[]> {
    return this.repository.findByCustomer ? this.repository.findByCustomer(customerId) : [];
  }

  /**
   * Get the waitlist for a given salon and time window, ordered by createdAt (FIFO).
   *
   * Requirements: R13.3
   *
   * @param salonId - The salon ID
   * @param windowStart - Start of the time window
   * @param windowEnd - End of the time window
   * @returns Waitlist entries in FIFO order (earliest-joined first)
   */
  async getWaitlist(
    salonId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<WaitlistEntry[]> {
    return this.repository.findWaiting(salonId, windowStart, windowEnd);
  }

  /**
   * Notify the earliest-joined waiting customer when a staff+chair pair frees
   * for a waitlisted time window.
   *
   * Requirements: R13.4
   *
   * This method finds the earliest-joined 'waiting' entry for the given salon
   * and time window, updates it to 'notified', and sends a notification to that
   * customer. If no one is waiting, it does nothing.
   *
   * @param salonId - The salon ID
   * @param windowStart - Start of the freed time window
   * @param windowEnd - End of the freed time window
   * @returns The notified entry, or null if no one is waiting
   */
  async notifyOnFree(
    salonId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<WaitlistEntry | null> {
    const waitingEntries = await this.repository.findWaiting(
      salonId,
      windowStart,
      windowEnd,
    );

    if (waitingEntries.length === 0) {
      return null;
    }

    // The first entry is the earliest-joined (FIFO order guaranteed by repository)
    const earliest = waitingEntries[0];

    // Update status to 'notified'
    const notifiedEntry = await this.repository.updateStatus(earliest.id, 'notified');

    // Send notification to the customer via the notifier
    const phone = await this.repository.findCustomerPhone(earliest.customerId);
    const salonName = await this.repository.findSalonName(salonId);
    if (phone) {
      await this.notifier.notifyWaitlistCustomer(phone, salonName ?? 'آرا');
    }

    return notifiedEntry;
  }

  /**
   * Mark a waitlist entry as fulfilled (the customer successfully booked the freed slot).
   *
   * @param entryId - The waitlist entry ID
   * @returns The updated entry
   */
  async fulfillEntry(entryId: string): Promise<WaitlistEntry> {
    const entry = await this.repository.findById(entryId);
    if (!entry) {
      throw new Error(`Waitlist entry ${entryId} not found`);
    }

    if (entry.status !== 'waiting' && entry.status !== 'notified') {
      throw new Error(
        `Waitlist entry ${entryId} cannot be fulfilled: current status is '${entry.status}'`,
      );
    }

    return this.repository.updateStatus(entryId, 'fulfilled');
  }

  /**
   * Cancel a waitlist entry (the customer no longer wants to wait).
   *
   * @param entryId - The waitlist entry ID
   * @returns The updated entry
   */
  async cancelEntry(entryId: string): Promise<WaitlistEntry> {
    const entry = await this.repository.findById(entryId);
    if (!entry) {
      throw new Error(`Waitlist entry ${entryId} not found`);
    }

    if (entry.status === 'fulfilled' || entry.status === 'cancelled') {
      throw new Error(
        `Waitlist entry ${entryId} cannot be cancelled: current status is '${entry.status}'`,
      );
    }

    return this.repository.updateStatus(entryId, 'cancelled');
  }
}
