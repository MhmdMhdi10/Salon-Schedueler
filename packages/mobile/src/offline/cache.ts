/**
 * Offline appointment cache.
 * Caches latest appointments locally so they can be displayed offline.
 * In production, backed by SQLite (op-sqlite / WatermelonDB).
 *
 * Requirements: 18.3, 18.4
 */

export interface CachedAppointment {
  id: string;
  salonName: string;
  serviceName: string;
  startAt: string;
  status: string;
  cachedAt: number;
}

export class AppointmentCache {
  private cache: Map<string, CachedAppointment> = new Map();

  /**
   * Store appointments in the local cache.
   */
  store(appointments: CachedAppointment[]): void {
    for (const appt of appointments) {
      this.cache.set(appt.id, { ...appt, cachedAt: Date.now() });
    }
  }

  /**
   * Retrieve all cached appointments, ordered by startAt.
   */
  getAll(): CachedAppointment[] {
    return Array.from(this.cache.values())
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  /**
   * Get a single cached appointment by ID.
   */
  get(id: string): CachedAppointment | undefined {
    return this.cache.get(id);
  }

  /**
   * Check if there's anything in the cache.
   * Returns false → show empty-state screen (R18.4).
   */
  hasData(): boolean {
    return this.cache.size > 0;
  }

  /**
   * Clear all cached data.
   */
  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
