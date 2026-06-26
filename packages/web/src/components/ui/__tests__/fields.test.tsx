import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextField } from '../TextField';
import { Textarea } from '../Textarea';
import { Checkbox } from '../Checkbox';
import { Switch } from '../Switch';
import { RadioGroup } from '../RadioGroup';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

/**
 * Component tests for the form-field primitives.
 * Covers visible labels, the error wiring (aria-invalid + aria-describedby +
 * role="alert"), helper-text association, the indeterminate checkbox, the
 * switch toggle, radio-group selection, and axe checks.
 * Requirements: 2.2, 2.3, 2.9, 10.4, 12.4
 */
describe('TextField', () => {
  it('associates a visible label with the input', () => {
    render(<TextField label="شماره موبایل" />);
    expect(screen.getByLabelText('شماره موبایل')).toBeInTheDocument();
  });

  it('helper text is wired via aria-describedby', () => {
    render(<TextField label="کد" helperText="۶ رقم" />);
    const input = screen.getByLabelText('کد');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('۶ رقم');
  });

  it('error sets aria-invalid, wires aria-describedby to a role=alert, and hides helper', () => {
    render(
      <TextField
        label="ایمیل"
        helperText="اختیاری"
        error="ایمیل نامعتبر است"
      />,
    );
    const input = screen.getByLabelText('ایمیل');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('ایمیل نامعتبر است');
    expect(describedBy).toContain(alert.id);
    // Helper text is replaced by the error.
    expect(screen.queryByText('اختیاری')).not.toBeInTheDocument();
  });

  it('passes through dir/inputMode for the phone field pattern', () => {
    render(
      <TextField
        label="تلفن"
        type="tel"
        inputMode="tel"
        dir="ltr"
        autoComplete="tel"
      />,
    );
    const input = screen.getByLabelText('تلفن');
    expect(input).toHaveAttribute('dir', 'ltr');
    expect(input).toHaveAttribute('inputmode', 'tel');
  });

  it('has no serious/critical a11y violations (with error)', async () => {
    const { rtlContainer } = renderRtl(
      <TextField label="نام" error="الزامی است" required />,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});

describe('Textarea', () => {
  it('wires the error to aria-invalid + describedby', () => {
    render(<Textarea label="توضیحات" error="خیلی کوتاه است" />);
    const area = screen.getByLabelText('توضیحات');
    expect(area).toHaveAttribute('aria-invalid', 'true');
    const describedBy = area.getAttribute('aria-describedby');
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      'خیلی کوتاه است',
    );
  });

  it('has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(
      <Textarea label="یادداشت" helperText="اختیاری" />,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});

describe('Checkbox', () => {
  it('toggles checked on click via its label', () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox label="قوانین را می‌پذیرم" onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByText('قوانین را می‌پذیرم'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('renders the indeterminate state', () => {
    render(<Checkbox label="همه" checked="indeterminate" />);
    const cb = screen.getByRole('checkbox', { name: 'همه' });
    expect(cb).toHaveAttribute('data-state', 'indeterminate');
  });

  it('disabled checkbox cannot be toggled', () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox label="غیرفعال" disabled onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByText('غیرفعال'));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(
      <Checkbox label="یادآوری" helperText="پیامک می‌فرستیم" />,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});

describe('Switch', () => {
  it('reflects and toggles the checked state', () => {
    const onCheckedChange = vi.fn();
    render(<Switch label="حالت تاریک" onCheckedChange={onCheckedChange} />);
    const sw = screen.getByRole('switch', { name: 'حالت تاریک' });
    expect(sw).toHaveAttribute('data-state', 'unchecked');
    fireEvent.click(sw);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(
      <Switch label="اعلان‌ها" helperText="فعال/غیرفعال" />,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});

describe('RadioGroup', () => {
  const options = [
    { value: 'sms', label: 'پیامک' },
    { value: 'call', label: 'تماس' },
    { value: 'none', label: 'هیچ‌کدام', disabled: true },
  ];

  it('renders all options as radios under a labelled group', () => {
    render(<RadioGroup label="روش اطلاع‌رسانی" options={options} />);
    expect(screen.getByRole('radio', { name: 'پیامک' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'تماس' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'هیچ‌کدام' })).toBeDisabled();
  });

  it('selects an option on click', () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup
        label="روش"
        options={options}
        onValueChange={onValueChange}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'تماس' }));
    expect(onValueChange).toHaveBeenCalledWith('call');
  });

  it('has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(
      <RadioGroup label="روش اطلاع‌رسانی" options={options} />,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
