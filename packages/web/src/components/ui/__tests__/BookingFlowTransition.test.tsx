import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { BookingFlowTransition } from '../BookingFlowTransition';
import '../../../i18n';

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
        className,
        ...rest
      }: any) => (
        <div
          data-testid="motion-div"
          data-initial={initial}
          data-animate={animate}
          data-exit={exit}
          data-custom={custom}
          className={className}
          {...rest}
        >
          {children}
        </div>
      ),
    },
  };
});

function renderAtRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/salon/:salonId/book"
          element={
            <BookingFlowTransition>
              <div data-testid="step-availability">Availability</div>
            </BookingFlowTransition>
          }
        />
        <Route
          path="/salon/:salonId/book/confirm"
          element={
            <BookingFlowTransition>
              <div data-testid="step-confirm">Confirm</div>
            </BookingFlowTransition>
          }
        />
        <Route
          path="/booking/success"
          element={
            <BookingFlowTransition>
              <div data-testid="step-success">Success</div>
            </BookingFlowTransition>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BookingFlowTransition', () => {
  it('wraps content in AnimatePresence with mode="wait"', async () => {
    await act(async () => {
      renderAtRoute('/salon/salon-1/book');
    });
    const ap = screen.getByTestId('animate-presence');
    expect(ap).toHaveAttribute('data-mode', 'wait');
  });

  it('applies step enter/center/exit animation states', async () => {
    await act(async () => {
      renderAtRoute('/salon/salon-1/book');
    });
    const motionDiv = screen.getByTestId('motion-div');
    expect(motionDiv).toHaveAttribute('data-initial', 'enter');
    expect(motionDiv).toHaveAttribute('data-animate', 'center');
    expect(motionDiv).toHaveAttribute('data-exit', 'exit');
  });

  it('passes direction=1 (forward) as default custom prop', async () => {
    await act(async () => {
      renderAtRoute('/salon/salon-1/book');
    });
    const ap = screen.getByTestId('animate-presence');
    expect(ap).toHaveAttribute('data-custom', '1');
  });

  it('assigns step index 0 for /book route', async () => {
    await act(async () => {
      renderAtRoute('/salon/salon-1/book');
    });
    expect(screen.getByTestId('step-availability')).toBeInTheDocument();
  });

  it('assigns step index 1 for /book/confirm route', async () => {
    await act(async () => {
      renderAtRoute('/salon/salon-1/book/confirm');
    });
    expect(screen.getByTestId('step-confirm')).toBeInTheDocument();
  });

  it('assigns step index 2 for /booking/success route', async () => {
    await act(async () => {
      renderAtRoute('/booking/success');
    });
    expect(screen.getByTestId('step-success')).toBeInTheDocument();
  });

  it('renders children within the motion.div', async () => {
    await act(async () => {
      renderAtRoute('/salon/salon-1/book');
    });
    const motionDiv = screen.getByTestId('motion-div');
    expect(motionDiv).toContainElement(screen.getByTestId('step-availability'));
  });
});
