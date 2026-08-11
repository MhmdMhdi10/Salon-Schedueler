export interface ImportedContact {
  fullName: string;
  phone: string;
}

export const MAX_VCARD_BYTES = 2 * 1024 * 1024;
export const MAX_VCARD_CONTACTS = 500;

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function normalizeDigits(value: string): string {
  return [...value]
    .map((character) => {
      const persianIndex = PERSIAN_DIGITS.indexOf(character);
      if (persianIndex >= 0) return String(persianIndex);
      const arabicIndex = ARABIC_DIGITS.indexOf(character);
      return arabicIndex >= 0 ? String(arabicIndex) : character;
    })
    .join('');
}

/** Normalize common Iranian mobile formats to 09xxxxxxxxx. */
export function normalizeIranianMobile(value: string): string | null {
  let digits = normalizeDigits(value).replace(/\D/g, '');
  if (digits.startsWith('0098')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('98')) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith('9') && digits.length === 10) digits = `0${digits}`;

  return /^09\d{9}$/.test(digits) ? digits : null;
}

function unescapeVCard(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\([\\;,])/g, '$1')
    .trim();
}

function decodeQuotedPrintable(value: string): string {
  const bytes: number[] = [];
  let plain = '';
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '=' && /^[0-9a-f]{2}$/i.test(value.slice(index + 1, index + 3))) {
      if (plain) {
        bytes.push(...new TextEncoder().encode(plain));
        plain = '';
      }
      bytes.push(Number.parseInt(value.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      plain += value[index];
    }
  }
  if (plain) bytes.push(...new TextEncoder().encode(plain));
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

function decodeField(value: string, params: string[]): string {
  const encoding = params
    .find((param) => param.toUpperCase().startsWith('ENCODING='))
    ?.slice(9)
    .toUpperCase();
  return unescapeVCard(encoding === 'QUOTED-PRINTABLE' ? decodeQuotedPrintable(value) : value);
}

function parseProperty(line: string): { name: string; params: string[]; value: string } | null {
  const separator = line.indexOf(':');
  if (separator < 1) return null;
  const [namePart, ...params] = line.slice(0, separator).split(';');
  return { name: namePart.toUpperCase(), params, value: line.slice(separator + 1) };
}

function nameFromFields(fn: string, n: string): string {
  if (fn) return fn;
  const parts = n.split(';').map((part) => unescapeVCard(part)).filter(Boolean);
  if (parts.length === 0) return '';
  const [family = '', given = '', additional = '', prefix = '', suffix = ''] = parts;
  return [prefix, given, additional, family, suffix].filter(Boolean).join(' ').trim();
}

/** Parse local vCard text without sending file contents anywhere. */
export function parseVCard(text: string): ImportedContact[] {
  const unfolded = text
    .replace(/=\r?\n[ \t]?/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '');
  const cards = unfolded.match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi) ?? [unfolded];
  const contacts: ImportedContact[] = [];
  const seen = new Set<string>();

  for (const card of cards.slice(0, MAX_VCARD_CONTACTS * 2)) {
    let fn = '';
    let n = '';
    const phones: string[] = [];
    for (const line of card.split('\n')) {
      const property = parseProperty(line.trim());
      if (!property) continue;
      if (property.name === 'FN') fn = decodeField(property.value, property.params);
      if (property.name === 'N') n = decodeField(property.value, property.params);
      if (property.name === 'TEL' || property.name.endsWith('.TEL')) {
        phones.push(decodeField(property.value, property.params));
      }
    }

    for (const rawPhone of phones) {
      const phone = normalizeIranianMobile(rawPhone);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      contacts.push({ fullName: nameFromFields(fn, n), phone });
      if (contacts.length >= MAX_VCARD_CONTACTS) return contacts;
    }
  }
  return contacts;
}

export function getContactPicker(): ContactPicker | null {
  if (typeof navigator === 'undefined') return null;
  const contacts = (navigator as NavigatorWithContacts).contacts;
  return contacts && typeof contacts.select === 'function' ? contacts : null;
}

export interface ContactPickerContact {
  name?: string[];
  tel?: string[];
}

interface ContactPicker {
  select(
    properties: Array<'name' | 'tel'>,
    options: { multiple: boolean },
  ): Promise<ContactPickerContact[]>;
}

interface NavigatorWithContacts extends Navigator {
  contacts?: ContactPicker;
}

export function contactsFromPicker(contacts: ContactPickerContact[]): ImportedContact[] {
  const result: ImportedContact[] = [];
  const seen = new Set<string>();
  for (const contact of contacts) {
    const phone = (contact.tel ?? []).map(normalizeIranianMobile).find(Boolean);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    result.push({ fullName: contact.name?.[0]?.trim() ?? '', phone });
  }
  return result;
}
