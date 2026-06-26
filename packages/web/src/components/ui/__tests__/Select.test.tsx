import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Select } from '../Select';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

/**
 * Component tests for the Select primitive (Radix-based).
 * Covers label association, placeholder, error wiring, the empty-options
 * state, and axe checks.
 * Requirements: 2.2, 2.3, 10.4, 12.4
 */
const options = [
  { value: 'haircut', label: 'کوتاهی مو' },
  { value: 'color', label: 'رنگ مو' },
];

describe('Select', () => {
  it('renders a labelled combobox showing the placeholder', () => {
    render(
      <Select label="خدمت" placeholder="یک خدمت انتخاب کنید" options={options} />,
    );
    const trigger = screen.getByRole('combobox', { name: /خدمت/ });
    expect(trigger).toHaveTextContent('یک خدمت انتخاب کنید');
  });

  it('reflects a controlled value', () => {
    render(<Select label="خدمت" value="color" options={options} />);
    expect(screen.getByRole('combobox', { name: /خدمت/ })).toHaveTextContent(
      'رنگ مو',
    );
  });

  it('error sets aria-invalid and renders a role=alert message', () => {
    render(<Select label="خدمت" options={options} error="انتخاب الزامی است" />);
    const trigger = screen.getByRole('combobox', { name: /خدمت/ });
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('انتخاب الزامی است');
  });

  it('shows the empty state when there are no options', () => {
    render(
      <Select
        label="خدمت"
        options={[]}
        emptyText="موردی موجود نیست"
        defaultValue={undefined}
      />,
    );
    // Open the listbox to reveal the empty message.
    fireEvent.click(screen.getByRole('combobox', { name: /خدمت/ }));
    expect(screen.getByText('موردی موجود نیست')).toBeInTheDocument();
  });

  it('has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(
      <Select label="خدمت" placeholder="انتخاب" options={options} />,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
