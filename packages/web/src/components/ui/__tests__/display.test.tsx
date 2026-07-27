import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Spinner } from '../Spinner';
import { Card, CardHeader, CardTitle, CardContent } from '../Card';
import { Badge } from '../Badge';
import { Skeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { ErrorState } from '../ErrorState';
import { Avatar } from '../Avatar';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

/**
 * Component tests for the display / feedback primitives.
 * Covers data states (loading skeleton, empty, error+retry), the decorative vs
 * labelled split (Spinner, Avatar, Skeleton), status badges (color+icon+text),
 * and axe checks.
 * Requirements: 2.2, 2.3, 10.4, 12.4
 */
describe('Spinner', () => {
  it('is decorative (aria-hidden) without a label', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
  });

  it('exposes a status role + label when labelled', () => {
    render(<Spinner label="در حال بارگذاری" />);
    const status = screen.getByRole('status', { name: 'در حال بارگذاری' });
    expect(status).toBeInTheDocument();
  });
});

describe('Card', () => {
  it('renders children in the populated state', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>سالن رز</CardTitle>
        </CardHeader>
        <CardContent>توضیحات</CardContent>
      </Card>,
    );
    expect(screen.getByRole('heading', { name: 'سالن رز' })).toBeInTheDocument();
  });

  it('loading swaps in a busy skeleton placeholder', () => {
    render(
      <Card loading loadingLabel="در حال بارگذاری">
        <div>محتوای واقعی</div>
      </Card>,
    );
    expect(screen.queryByText('محتوای واقعی')).not.toBeInTheDocument();
    const status = screen.getByRole('status', { name: 'در حال بارگذاری' });
    expect(status).toBeInTheDocument();
  });

  it('has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(
      <Card>
        <CardTitle>عنوان</CardTitle>
        <CardContent>متن</CardContent>
      </Card>,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});

describe('Badge', () => {
  it('renders its text label alongside the default status icon (not color-only)', () => {
    const { container } = render(<Badge status="success">پرداخت شد</Badge>);
    expect(screen.getByText('پرداخت شد')).toBeInTheDocument();
    // The default status icon is an SVG (visual cue beyond color).
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('omits the icon when icon={null}', () => {
    const { container } = render(
      <Badge status="neutral" icon={null}>
        پیش‌نویس
      </Badge>,
    );
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(<Badge status="danger">ناموفق</Badge>);
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});

describe('Skeleton', () => {
  it('is decorative (aria-hidden) so it does not spam assistive tech', () => {
    const { container } = render(<Skeleton variant="text" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('EmptyState', () => {
  it('shows the title, description, and next-step action', () => {
    render(
      <EmptyState
        title="هنوز نوبتی ثبت نشده"
        description="اولین رزرو را ایجاد کنید"
        action={<button type="button">ایجاد رزرو</button>}
      />,
    );
    expect(screen.getByText('هنوز نوبتی ثبت نشده')).toBeInTheDocument();
    expect(screen.getByText('اولین رزرو را ایجاد کنید')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ایجاد رزرو' })).toBeInTheDocument();
  });

  it('has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(
      <EmptyState title="خالی است" description="چیزی برای نمایش نیست" />,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});

describe('ErrorState', () => {
  it('announces via role=alert and renders a working retry action', () => {
    const onRetry = vi.fn();
    render(
      <ErrorState title="بارگذاری ناموفق بود" description="اتصال برقرار نشد" onRetry={onRetry} />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('بارگذاری ناموفق بود');
    fireEvent.click(screen.getByRole('button', { name: 'تلاش مجدد' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(
      <ErrorState title="خطا" description="دوباره تلاش کنید" onRetry={() => {}} />,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});

describe('Avatar', () => {
  it('labelled fallback exposes the name to assistive tech', () => {
    render(<Avatar name="سارا محمدی" />);
    const img = screen.getByRole('img', { name: 'سارا محمدی' });
    expect(img).toBeInTheDocument();
  });

  it('decorative avatar is hidden from assistive tech', () => {
    render(<Avatar name="سارا محمدی" decorative />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(<Avatar name="سارا محمدی" />);
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
