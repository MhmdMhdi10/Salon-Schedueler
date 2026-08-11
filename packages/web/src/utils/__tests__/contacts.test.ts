import { describe, expect, it } from 'vitest';
import { contactsFromPicker, normalizeIranianMobile, parseVCard } from '../contacts';

describe('normalizeIranianMobile', () => {
  it.each([
    ['09121234567', '09121234567'],
    ['+98 912 123 4567', '09121234567'],
    ['00989121234567', '09121234567'],
    ['۹۸۹۱۲۱۲۳۴۵۶۷', '09121234567'],
    ['9121234567', '09121234567'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeIranianMobile(input)).toBe(expected);
  });

  it('rejects landlines and malformed numbers', () => {
    expect(normalizeIranianMobile('02112345678')).toBeNull();
    expect(normalizeIranianMobile('+1 555 123 4567')).toBeNull();
  });
});

describe('parseVCard', () => {
  it('parses folded, escaped, quoted-printable cards and de-duplicates phones', () => {
    const text = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D8=B9=D9=84=DB=8C=20=D8=B1=D8=B6=D8=A7=DB=8C=DB=8C',
      'TEL;TYPE=CELL:+98 912 123 4567',
      'TEL;TYPE=HOME:02112345678',
      'END:VCARD',
      'BEGIN:VCARD',
      'N:رضایی;علی;;;',
      'TEL:09121234567',
      'END:VCARD',
    ].join('\r\n');

    expect(parseVCard(text)).toEqual([{ fullName: 'علی رضایی', phone: '09121234567' }]);
  });

  it('uses N when FN is absent and ignores invalid cards', () => {
    expect(
      parseVCard('BEGIN:VCARD\nN:کریمی;مریم;;;\nTEL:00989131234567\nEND:VCARD'),
    ).toEqual([{ fullName: 'مریم کریمی', phone: '09131234567' }]);
  });
});

describe('contactsFromPicker', () => {
  it('keeps first valid Iranian mobile and drops invalid contacts', () => {
    expect(
      contactsFromPicker([
        { name: ['سارا'], tel: ['02112345678', '+989121234567'] },
        { name: ['تکراری'], tel: ['09121234567'] },
      ]),
    ).toEqual([{ fullName: 'سارا', phone: '09121234567' }]);
  });
});
