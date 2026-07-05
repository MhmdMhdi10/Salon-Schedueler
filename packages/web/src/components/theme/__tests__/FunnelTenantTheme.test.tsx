import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { FunnelTenantTheme } from '../FunnelTenantTheme';
import '../../../i18n';

// Mock the brand accent API to resolve immediately with null (no accent).
vi.mock('../../../api/client', () => ({
  brandAccentApi: {
    get: vi.fn().mockResolvedValue({ brandAccent: null }),
  },
}));

// Mock framer-motion to inspect AnimatePresence and motion.div usage without
// running real animations in JSDOM.
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    useReducedMotion: () => false,
    AnimatePresence: ({ children, mode, custom }: any) => (
      <div data-testid="animate-presence" data-mode={mode} data-custom={custom}>
        {children}
      </div>
    ),
    motion: {
      ...actual.motion,
      div: ({
        children,
        variants,
        initial,
        animate,
        exit,
        transition,
        custom,
        ...rest
      }: any) => (
        <div
          data-testid="motion-div"
          data-initial={initial}
          data-animate={animate}
          data-exit={exit}
          data-custom={custom}
          {...rest}
        >
          {children}
        </div>
      ),
    },
  };
});

function renderWithRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/salon/:salonId/book" element={<FunnelTenantTheme />}>
          <Route index element={<div data-testid="availability-step">Availability</div>} />
          <Route path="confirm" element={<div data-testid="confirm-step">Confirm</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('FunnelTenantTheme — step transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wraps the outlet in AnimatePresence with mode="wait"', async () => {
    await act(async () => {
      renderWithRoute('/salon/salon-1/book');
    });
    const ap = screen.getByTestId('animate-presence');
    expect(ap).toHaveAttribute('data-mode', 'wait');
  });

  it('renders the availability step content at the /book route', async () => {
    await act(async () => {
      renderWithRoute('/salon/salon-1/book');
    });
    expect(screen.getByTestId('availability-step')).toBeInTheDocument();
  });

  it('renders the confirm step content at the /book/confirm route', async () => {
    await act(async () => {
      renderWithRoute('/salon/salon-1/book/confirm');
    });
    expect(screen.getByTestId('confirm-step')).toBeInTheDocument();
  });

  it('applies step enter/center/exit animation states on the motion.div', async () => {
    await act(async () => {
      renderWithRoute('/salon/salon-1/book');
    });
    const motionDiv = screen.getByTestId('motion-div');
    expect(motionDiv).toHaveAttribute('data-initial', 'enter');
    expect(motionDiv).toHaveAttribute('data-animate', 'center');
    expect(motionDiv).toHaveAttribute('data-exit', 'exit');
  });

  it('passes direction=1 (forward) as custom to AnimatePresence by default', async () => {
    await act(async () => {
      renderWithRoute('/salon/salon-1/book');
    });
    const ap = screen.getByTestId('animate-presence');
    // Default direction on mount is 1 (forward)
    expect(ap).toHaveAttribute('data-custom', '1');
  });
});
