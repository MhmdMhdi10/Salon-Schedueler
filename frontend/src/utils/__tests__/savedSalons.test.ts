import { beforeEach, describe, expect, it } from 'vitest';
import {
  readSavedSalons,
  removeSavedSalon,
  saveSalon,
  savedSalonBookingPath,
} from '../savedSalons';

beforeEach(() => localStorage.clear());

describe('savedSalons', () => {
  it('persists scans newest-first and de-duplicates the same QR identity', () => {
    saveSalon({ id: 'salon-1', name: 'سالن اول' });
    saveSalon({ id: 'salon-2', name: 'سالن دوم' });
    saveSalon({ id: 'salon-1', name: 'سالن اول جدید' });

    expect(readSavedSalons().map((salon) => salon.name)).toEqual(['سالن اول جدید', 'سالن دوم']);
  });

  it('preserves a stylist QR as a fast-booking destination', () => {
    const salon = saveSalon({
      id: 'salon-1',
      name: 'سالن رز',
      staffId: 'staff 1',
      staffName: 'مریم',
    })[0];

    expect(savedSalonBookingPath(salon)).toBe('/salon/salon-1/book?staff=staff%201');
  });

  it('removes only the selected salon/stylist entry', () => {
    saveSalon({ id: 'salon-1', name: 'سالن رز' });
    saveSalon({ id: 'salon-1', name: 'سالن رز', staffId: 'staff-1' });
    removeSavedSalon('salon-1', 'staff-1');

    expect(readSavedSalons()).toHaveLength(1);
    expect(readSavedSalons()[0].staffId).toBeUndefined();
  });
});
