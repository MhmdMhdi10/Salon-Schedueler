/**
 * Offline submission outbox for booking requests.
 * Preserves failed submissions in a local store (SQLite in production)
 * so they can be retried when connectivity returns.
 *
 * Requirement: 18.5 - Offline submission preservation
 */

export interface OutboxEntry {
  id: string;
  payload: BookingPayload;
  createdAt: number; // timestamp ms
  status: 'pending' | 'submitted' | 'failed';
  error?: string;
  retryCount: number;
}

export interface BookingPayload {
  salonId: string;
  serviceId: string;
  startAt: string;
  preferredStaffId?: string;
}

/**
 * In-memory outbox store. In production this would be backed by SQLite
 * (op-sqlite or WatermelonDB) for persistence across app restarts.
 */
export class SubmissionOutbox {
  private entries: Map<string, OutboxEntry> = new Map();

  /** Generate a unique ID for an outbox entry */
  private generateId(): string {
    return `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Add a failed submission to the outbox.
   * Returns the entry ID for tracking.
   */
  enqueue(payload: BookingPayload, error: string): string {
    const id = this.generateId();
    const entry: OutboxEntry = {
      id,
      payload,
      createdAt: Date.now(),
      status: 'pending',
      error,
      retryCount: 0,
    };
    this.entries.set(id, entry);
    return id;
  }

  /**
   * Retrieve an entry by ID.
   */
  get(id: string): OutboxEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Get all pending entries ordered by creation time (FIFO).
   */
  getPending(): OutboxEntry[] {
    return Array.from(this.entries.values())
      .filter((e) => e.status === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Get all entries regardless of status.
   */
  getAll(): OutboxEntry[] {
    return Array.from(this.entries.values())
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Mark an entry as successfully submitted.
   */
  markSubmitted(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    entry.status = 'submitted';
    return true;
  }

  /**
   * Mark an entry as failed with error info, increment retry count.
   */
  markFailed(id: string, error: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    entry.status = 'failed';
    entry.error = error;
    entry.retryCount++;
    return true;
  }

  /**
   * Reset a failed entry back to pending for retry.
   */
  resetToPending(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    entry.status = 'pending';
    return true;
  }

  /**
   * Remove an entry from the outbox (e.g., after successful submission).
   */
  remove(id: string): boolean {
    return this.entries.delete(id);
  }

  /**
   * Get the total number of entries.
   */
  get size(): number {
    return this.entries.size;
  }
}
