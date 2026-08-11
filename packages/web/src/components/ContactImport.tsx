import { useRef, useState } from 'react';
import { ContactRound, FileUp } from 'lucide-react';
import { Button, cn } from './ui';
import {
  contactsFromPicker,
  getContactPicker,
  MAX_VCARD_BYTES,
  parseVCard,
  type ImportedContact,
} from '../utils/contacts';

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Contact file is not text'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Contact file could not be read'));
    reader.readAsText(file);
  });
}

interface ContactImportProps {
  disabled?: boolean;
  onSelect: (contact: ImportedContact) => void;
}

export function ContactImport({ disabled = false, onSelect }: ContactImportProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [candidates, setCandidates] = useState<ImportedContact[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pickerAvailable = Boolean(getContactPicker());

  const showCandidates = (contacts: ImportedContact[]) => {
    if (contacts.length === 0) {
      setCandidates([]);
      setError('مخاطب معتبری با شماره موبایل ایران پیدا نشد.');
    } else if (contacts.length === 1) {
      setCandidates([]);
      setError('');
      onSelect(contacts[0]);
    } else {
      setError('');
      setCandidates(contacts);
    }
  };

  const handlePicker = async () => {
    const picker = getContactPicker();
    if (!picker) {
      setError('انتخاب مستقیم مخاطبین در این مرورگر در دسترس نیست؛ فایل مخاطبین را وارد کنید.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const selected = await picker.select(['name', 'tel'], { multiple: true });
      showCandidates(contactsFromPicker(selected));
    } catch {
      // Cancellation is a normal user action; keep the form unchanged and quiet.
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_VCARD_BYTES) {
      setError('فایل مخاطبین بزرگ است؛ فایل کوچک‌تری انتخاب کنید.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      showCandidates(parseVCard(await readFileText(file)));
    } catch {
      setCandidates([]);
      setError('خواندن فایل مخاطبین انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {pickerAvailable && (
          <Button
            type="button"
            variant="secondary"
            size="md"
            startIcon={<ContactRound className="h-4 w-4" />}
            onClick={() => void handlePicker()}
            disabled={disabled || busy}
          >
            انتخاب از مخاطبین
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          size="md"
          startIcon={<FileUp className="h-4 w-4" />}
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
        >
          وارد کردن فایل مخاطبین
        </Button>
      </div>
      <p className="text-xs leading-5 text-muted">
        {pickerAvailable
          ? 'فایل یا مخاطب فقط روی همین دستگاه خوانده می‌شود؛ اطلاعاتی به سرور ارسال نمی‌شود.'
          : 'این مرورگر لیست مخاطبین گوشی را باز نمی‌کند؛ یک فایل .vcf را از Files انتخاب کنید. اطلاعاتی به سرور ارسال نمی‌شود.'}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".vcf,.vcard,text/vcard,text/x-vcard,application/vcard"
        className="sr-only"
        onChange={(event) => void handleFile(event)}
        disabled={disabled || busy}
        aria-label="وارد کردن فایل مخاطبین"
      />
      {candidates.length > 1 && (
        <div className="rounded-md border border-border bg-surface p-2" aria-live="polite">
          <p className="mb-1 text-xs font-medium text-text">مخاطب را انتخاب کنید</p>
          <div className="grid gap-1" aria-label="مخاطبین پیدا شده">
            {candidates.map((contact) => (
              <button
                key={contact.phone}
                type="button"
                className={cn(
                  'flex min-h-11 items-center justify-between gap-3 rounded-md px-3 py-2 text-start text-sm text-text',
                  'hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                )}
                onClick={() => {
                  setCandidates([]);
                  onSelect(contact);
                }}
              >
                <span className="min-w-0 truncate">{contact.fullName || 'بدون نام'}</span>
                <span dir="ltr" className="shrink-0 tabular-nums text-muted">{contact.phone}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs leading-5 text-danger">{error}</p>}
      {busy && <p className="text-xs text-muted" role="status">در حال خواندن مخاطبین…</p>}
    </div>
  );
}
