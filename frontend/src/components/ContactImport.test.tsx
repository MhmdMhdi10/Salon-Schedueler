import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContactImport } from './ContactImport';

afterEach(() => {
  delete (navigator as Navigator & { contacts?: unknown }).contacts;
});

describe('ContactImport', () => {
  it('uses Contact Picker when browser exposes it and lets owner choose one result', async () => {
    const select = vi.fn().mockResolvedValue([
      { name: ['علی رضایی'], tel: ['+989121234567'] },
      { name: ['مریم کریمی'], tel: ['09131234567'] },
    ]);
    Object.defineProperty(navigator, 'contacts', {
      configurable: true,
      value: { select },
    });
    const onSelect = vi.fn();
    render(<ContactImport onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'انتخاب از مخاطبین' }));
    await waitFor(() => expect(select).toHaveBeenCalledWith(['name', 'tel'], { multiple: true }));
    expect(screen.getByRole('button', { name: /علی رضایی/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /مریم کریمی/ }));
    expect(onSelect).toHaveBeenCalledWith({ fullName: 'مریم کریمی', phone: '09131234567' });
  });

  it('keeps file import available when Contact Picker is unavailable', async () => {
    const onSelect = vi.fn();
    render(<ContactImport onSelect={onSelect} />);
    expect(screen.queryByRole('button', { name: 'انتخاب از مخاطبین' })).not.toBeInTheDocument();
    expect(screen.getByText(/این مرورگر لیست مخاطبین گوشی را باز نمی‌کند/)).toBeInTheDocument();

    const vcard = 'BEGIN:VCARD\nFN:سارا\nTEL:+989121234567\nEND:VCARD';
    const file = new File(
      [vcard],
      'contacts.vcf',
      { type: 'text/vcard' },
    );
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: vi.fn().mockResolvedValue(vcard),
    });
    fireEvent.change(screen.getByLabelText('وارد کردن فایل مخاطبین'), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith({ fullName: 'سارا', phone: '09121234567' }),
    );
  });
});
