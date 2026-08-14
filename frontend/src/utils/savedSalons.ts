export const SAVED_SALONS_KEY = 'ara-saved-salons-v1';
export const SAVED_SALONS_CHANGED = 'ara-saved-salons-changed';

export interface SavedSalon {
  id: string;
  name: string;
  staffId?: string;
  staffName?: string;
  savedAt: string;
}

function isSavedSalon(value: unknown): value is SavedSalon {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SavedSalon>;
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.name === 'string' &&
    item.name.length > 0 &&
    typeof item.savedAt === 'string'
  );
}

/** Anonymous, device-local list. Storage failures never block booking. */
export function readSavedSalons(): SavedSalon[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_SALONS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isSavedSalon) : [];
  } catch {
    return [];
  }
}

function writeSavedSalons(items: SavedSalon[]): void {
  try {
    window.localStorage.setItem(SAVED_SALONS_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(SAVED_SALONS_CHANGED));
  } catch {
    // Private mode/quota failure: booking remains available without persistence.
  }
}

function salonKey(item: Pick<SavedSalon, 'id' | 'staffId'>): string {
  return `${item.id}:${item.staffId ?? ''}`;
}

export function saveSalon(
  salon: Pick<SavedSalon, 'id' | 'name' | 'staffId' | 'staffName'>,
): SavedSalon[] {
  const saved: SavedSalon = { ...salon, savedAt: new Date().toISOString() };
  const key = salonKey(saved);
  const next = [saved, ...readSavedSalons().filter((item) => salonKey(item) !== key)];
  writeSavedSalons(next);
  return next;
}

export function removeSavedSalon(id: string, staffId?: string): SavedSalon[] {
  const key = salonKey({ id, staffId });
  const next = readSavedSalons().filter((item) => salonKey(item) !== key);
  writeSavedSalons(next);
  return next;
}

export function savedSalonBookingPath(salon: Pick<SavedSalon, 'id' | 'staffId'>): string {
  return `/salon/${salon.id}/book${
    salon.staffId ? `?staff=${encodeURIComponent(salon.staffId)}` : ''
  }`;
}
