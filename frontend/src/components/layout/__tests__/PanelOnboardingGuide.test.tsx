import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PanelOnboardingGuide,
  useFirstVisitPanelGuide,
  type PanelGuideStep,
} from '../PanelOnboardingGuide';

const STEPS: readonly PanelGuideStep[] = [
  { id: 'first', title: 'سکشن اول', body: 'توضیح سکشن اول', to: '/first' },
  { id: 'second', title: 'سکشن دوم', body: 'توضیح سکشن دوم', to: '/second' },
];

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="guide-location">{location.pathname}</output>;
}

function GuideHarness({ storageKey = 'test-panel-guide' }: { storageKey?: string }) {
  const guide = useFirstVisitPanelGuide(storageKey);
  return (
    <>
      <button type="button" onClick={guide.replay}>
        اجرای راهنما
      </button>
      <div data-panel-guide="first">سکشن اول صفحه</div>
      <div data-panel-guide="second">سکشن دوم صفحه</div>
      <PanelOnboardingGuide open={guide.open} onClose={guide.close} steps={STEPS} />
    </>
  );
}

describe('PanelOnboardingGuide', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('auto-opens on first visit, highlights target, and records dismissal', async () => {
    render(
      <MemoryRouter initialEntries={['/first']}>
        <GuideHarness />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('panel-guide-dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'سکشن اول' })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector('[data-panel-guide-active="true"]')).toBeInTheDocument();
      expect(document.querySelector('.panel-onboarding-guide__scrim')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('panel-guide-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('panel-guide-dialog')).not.toBeInTheDocument();
    });
    expect(localStorage.getItem('test-panel-guide')).toBe('done');
  });

  it('does not auto-open after dismissal but can be replayed from the trigger', async () => {
    localStorage.setItem('test-panel-guide', 'done');
    render(
      <MemoryRouter initialEntries={['/first']}>
        <GuideHarness />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('panel-guide-dialog')).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'اجرای راهنما' }));
    expect(await screen.findByTestId('panel-guide-dialog')).toBeInTheDocument();
  });

  it('advances in order, navigates to next section, and moves active highlight', async () => {
    render(
      <MemoryRouter initialEntries={['/first']}>
        <LocationProbe />
        <div data-panel-guide="first">سکشن اول صفحه</div>
        <div data-panel-guide="second">سکشن دوم صفحه</div>
        <PanelOnboardingGuide open onClose={() => {}} steps={STEPS} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'سکشن اول' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('panel-guide-next'));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'سکشن دوم' })).toBeInTheDocument();
      expect(screen.getByTestId('guide-location')).toHaveTextContent('/second');
      expect(document.querySelector('[data-panel-guide-active="true"]')).toHaveTextContent(
        'سکشن دوم صفحه',
      );
    });
  });
});
