import {
  gregorianToJalali,
  jalaliToGregorian,
  formatJalali,
  formatJalaliWithDay,
  getJalaliMonthName,
  JALALI_MONTHS,
} from './index';

describe('Jalali conversions', () => {
  describe('gregorianToJalali', () => {
    it('converts a known Gregorian date to Jalali', () => {
      // 2024-03-20 = 1403/01/01 (Nowruz)
      const result = gregorianToJalali({ year: 2024, month: 3, day: 20 });
      expect(result).toEqual({ jy: 1403, jm: 1, jd: 1 });
    });

    it('converts another known date', () => {
      // 2023-09-23 = 1402/07/01
      const result = gregorianToJalali({ year: 2023, month: 9, day: 23 });
      expect(result).toEqual({ jy: 1402, jm: 7, jd: 1 });
    });
  });

  describe('jalaliToGregorian', () => {
    it('converts a known Jalali date to Gregorian', () => {
      // 1403/01/01 = 2024-03-20
      const result = jalaliToGregorian({ jy: 1403, jm: 1, jd: 1 });
      expect(result).toEqual({ year: 2024, month: 3, day: 20 });
    });

    it('converts another known date', () => {
      // 1402/07/01 = 2023-09-23
      const result = jalaliToGregorian({ jy: 1402, jm: 7, jd: 1 });
      expect(result).toEqual({ year: 2023, month: 9, day: 23 });
    });
  });

  describe('round-trip (Requirement 17.4)', () => {
    it('gregorian -> jalali -> gregorian returns original', () => {
      const original = { year: 2024, month: 6, day: 15 };
      const jalali = gregorianToJalali(original);
      const back = jalaliToGregorian(jalali);
      expect(back).toEqual(original);
    });

    it('jalali -> gregorian -> jalali returns original', () => {
      const original = { jy: 1403, jm: 4, jd: 10 };
      const greg = jalaliToGregorian(original);
      const back = gregorianToJalali(greg);
      expect(back).toEqual(original);
    });
  });

  describe('formatJalali', () => {
    it('formats a Date with default YYYY/MM/DD format', () => {
      // 2024-03-20 = 1403/01/01
      const d = new Date(2024, 2, 20); // month is 0-indexed in JS Date
      const result = formatJalali(d);
      expect(result).toBe('1403/01/01');
    });

    it('formats a GregorianDate object', () => {
      const result = formatJalali({ year: 2024, month: 3, day: 20 }, 'YYYY-MM-DD');
      expect(result).toBe('1403-01-01');
    });

    it('formats with single-digit month and day tokens', () => {
      const result = formatJalali({ year: 2024, month: 3, day: 20 }, 'YYYY/M/D');
      expect(result).toBe('1403/1/1');
    });
  });

  describe('formatJalaliWithDay', () => {
    it('includes the Persian day name', () => {
      // 2024-03-20 is a Wednesday = چهارشنبه
      const d = new Date(2024, 2, 20);
      const result = formatJalaliWithDay(d);
      expect(result).toContain('چهارشنبه');
      expect(result).toContain('1403/01/01');
    });
  });

  describe('getJalaliMonthName', () => {
    it('returns correct month names', () => {
      expect(getJalaliMonthName(1)).toBe('فروردین');
      expect(getJalaliMonthName(7)).toBe('مهر');
      expect(getJalaliMonthName(12)).toBe('اسفند');
    });

    it('throws for invalid month numbers', () => {
      expect(() => getJalaliMonthName(0)).toThrow(RangeError);
      expect(() => getJalaliMonthName(13)).toThrow(RangeError);
    });
  });

  describe('JALALI_MONTHS', () => {
    it('has 12 entries', () => {
      expect(JALALI_MONTHS).toHaveLength(12);
    });
  });
});
