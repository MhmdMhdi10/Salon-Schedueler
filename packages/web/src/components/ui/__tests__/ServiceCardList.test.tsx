import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ServiceCardList } from '../ServiceCardList';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  return {
    ...actual,
    useReducedMotion: () => true, // treat as reduced motion in tests
  };
});

const mockServices = [
  { id: 'svc-1', name: 'کوتاهی مو', durationMinutes: 45, priceRial: 250000 },
  { id: 'svc-2', name: 'رنگ مو', durationMinutes: 90, priceRial: 800000 },
  { id: 'svc-3', name: 'مش مو', durationMinutes: 120, priceRial: 1200000 },
];

const mockGroupedServices = [
  { id: 'svc-1', name: 'کوتاهی مو', durationMinutes: 45, priceRial: 250000, category: 'مو' },
  { id: 'svc-2', name: 'رنگ مو', durationMinutes: 90, priceRial: 800000, category: 'مو' },
  { id: 'svc-3', name: 'اصلاح صورت', durationMinutes: 30, priceRial: 150000, category: 'صورت' },
];

describe('ServiceCardList', () => {
  it('renders all service cards', () => {
    render(
      <ServiceCardList
        services={mockServices}
        value=""
        onValueChange={() => {}}
        ariaLabel="انتخاب خدمت"
      />,
    );

    expect(screen.getByText('کوتاهی مو')).toBeInTheDocument();
    expect(screen.getByText('رنگ مو')).toBeInTheDocument();
    expect(screen.getByText('مش مو')).toBeInTheDocument();
  });

  it('renders duration labels for each service', () => {
    const durationLabel = (m: number) => `${m} دقیقه`;
    render(
      <ServiceCardList
        services={mockServices}
        value=""
        onValueChange={() => {}}
        durationLabel={durationLabel}
      />,
    );

    expect(screen.getByText('45 دقیقه')).toBeInTheDocument();
    expect(screen.getByText('90 دقیقه')).toBeInTheDocument();
    expect(screen.getByText('120 دقیقه')).toBeInTheDocument();
  });

  it('marks selected card with aria-checked', () => {
    render(
      <ServiceCardList
        services={mockServices}
        value="svc-2"
        onValueChange={() => {}}
      />,
    );

    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveAttribute('aria-checked', 'false');
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    expect(radios[2]).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onValueChange when a card is clicked', () => {
    const onChange = vi.fn();
    render(
      <ServiceCardList
        services={mockServices}
        value=""
        onValueChange={onChange}
      />,
    );

    fireEvent.click(screen.getByText('رنگ مو'));
    expect(onChange).toHaveBeenCalledWith('svc-2');
  });

  it('renders as a radiogroup with aria-label', () => {
    render(
      <ServiceCardList
        services={mockServices}
        value=""
        onValueChange={() => {}}
        ariaLabel="انتخاب خدمت"
      />,
    );

    const group = screen.getByRole('radiogroup');
    expect(group).toHaveAttribute('aria-label', 'انتخاب خدمت');
  });

  it('groups services by category when categories are provided', () => {
    render(
      <ServiceCardList
        services={mockGroupedServices}
        value=""
        onValueChange={() => {}}
      />,
    );

    expect(screen.getByText('مو')).toBeInTheDocument();
    expect(screen.getByText('صورت')).toBeInTheDocument();
  });

  it('applies selected styles (border-primary) to the active card', () => {
    render(
      <ServiceCardList
        services={mockServices}
        value="svc-1"
        onValueChange={() => {}}
      />,
    );

    const selectedRadio = screen.getAllByRole('radio')[0];
    expect(selectedRadio.className).toContain('border-primary');
  });

  it('renders checkmark for selected service', () => {
    const { container } = render(
      <ServiceCardList
        services={mockServices}
        value="svc-1"
        onValueChange={() => {}}
      />,
    );

    // Checkmark is rendered as a circle with Check icon
    const checkCircle = container.querySelector('.bg-primary.rounded-full');
    expect(checkCircle).toBeInTheDocument();
  });

  it('does not render checkmark for unselected services', () => {
    const { container } = render(
      <ServiceCardList
        services={mockServices}
        value="svc-1"
        onValueChange={() => {}}
      />,
    );

    // Only one checkmark should exist (for the selected service)
    const checkCircles = container.querySelectorAll('.bg-primary.rounded-full');
    expect(checkCircles).toHaveLength(1);
  });
});
