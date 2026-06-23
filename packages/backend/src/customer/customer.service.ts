/**
 * CustomerService — manages customer profile, history, notes, and preferred staff.
 *
 * - `getHistory` — retrieves a customer's past appointments (R14.1)
 * - `addNote` — adds a free-text note to a customer profile (R14.2)
 * - `getNotes` — retrieves all notes for a customer (R14.2, R14.4)
 * - `getPreferredStaff` — returns the customer's preferred staff member (R14.3)
 * - `setPreferredStaff` — sets or clears a customer's preferred staff
 *
 * Requirements: R14.1, R14.2, R14.3, R14.4
 */

/**
 * Represents a customer appointment record (simplified for history).
 */
export interface AppointmentRecord {
  id: string;
  salonId: string;
  serviceId: string;
  staffMemberId: string;
  chairId: string;
  startAt: Date;
  endAt: Date;
  status: string;
  source: string;
  createdAt: Date;
}

/**
 * Represents a customer note.
 */
export interface CustomerNote {
  id: string;
  customerId: string;
  authorId: string | null;
  body: string;
  createdAt: Date;
}

/**
 * Represents a staff member reference.
 */
export interface StaffRef {
  id: string;
  fullName: string;
  role: string;
}

/**
 * Repository port for customer data access.
 * Abstracted from Prisma so tests can supply in-memory fakes.
 */
export interface CustomerRepository {
  /** Find a customer by ID. */
  findById(customerId: string): Promise<{ id: string; preferredStaffId: string | null } | null>;

  /** Get past appointments for a customer, ordered by startAt descending. */
  getAppointments(customerId: string): Promise<AppointmentRecord[]>;

  /** Create a new note for a customer. */
  createNote(customerId: string, authorId: string | null, body: string): Promise<CustomerNote>;

  /** Get all notes for a customer, ordered by createdAt descending. */
  getNotes(customerId: string): Promise<CustomerNote[]>;

  /** Get the preferred staff member for a customer. */
  getPreferredStaff(customerId: string): Promise<StaffRef | null>;

  /** Set the preferred staff member for a customer. */
  setPreferredStaff(customerId: string, staffId: string | null): Promise<void>;
}

export class CustomerService {
  private readonly repository: CustomerRepository;

  constructor(repository: CustomerRepository) {
    this.repository = repository;
  }

  /**
   * Get the appointment history for a customer.
   *
   * Requirements: R14.1
   *
   * @param customerId - The customer ID
   * @returns Past appointments in reverse chronological order
   */
  async getHistory(customerId: string): Promise<AppointmentRecord[]> {
    const customer = await this.repository.findById(customerId);
    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }
    return this.repository.getAppointments(customerId);
  }

  /**
   * Add a free-text note to a customer profile.
   *
   * Requirements: R14.2
   *
   * @param customerId - The customer ID
   * @param authorId - The ID of the staff member adding the note (nullable)
   * @param body - The note text
   * @returns The created note
   */
  async addNote(customerId: string, authorId: string | null, body: string): Promise<CustomerNote> {
    if (!body || body.trim().length === 0) {
      throw new Error('Note body cannot be empty');
    }

    const customer = await this.repository.findById(customerId);
    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    return this.repository.createNote(customerId, authorId, body.trim());
  }

  /**
   * Get all notes for a customer.
   *
   * Requirements: R14.2, R14.4
   *
   * @param customerId - The customer ID
   * @returns Notes in reverse chronological order
   */
  async getNotes(customerId: string): Promise<CustomerNote[]> {
    const customer = await this.repository.findById(customerId);
    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }
    return this.repository.getNotes(customerId);
  }

  /**
   * Get the customer's preferred staff member.
   *
   * Requirements: R14.3
   *
   * @param customerId - The customer ID
   * @returns The preferred staff member reference, or null if none set
   */
  async getPreferredStaff(customerId: string): Promise<StaffRef | null> {
    const customer = await this.repository.findById(customerId);
    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    if (!customer.preferredStaffId) {
      return null;
    }

    return this.repository.getPreferredStaff(customerId);
  }

  /**
   * Set or clear the customer's preferred staff member.
   *
   * @param customerId - The customer ID
   * @param staffId - The staff member ID to set, or null to clear
   */
  async setPreferredStaff(customerId: string, staffId: string | null): Promise<void> {
    const customer = await this.repository.findById(customerId);
    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    await this.repository.setPreferredStaff(customerId, staffId);
  }
}
