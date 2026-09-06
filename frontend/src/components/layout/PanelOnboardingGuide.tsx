import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleHelp, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../ui/cn';
import { toPersianDigits } from '../ui/Num';

import './panel-onboarding-guide.css';

/** One stop in a panel walkthrough. `to` moves the user to the section. */
export interface PanelGuideStep {
  id: string;
  /** Optional context label shown above the step title. */
  eyebrow?: string;
  title: string;
  body: string;
  to?: string;
}

interface GuideRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface PanelOnboardingGuideProps {
  /** Whether the walkthrough is visible. */
  open: boolean;
  /** Closes the walkthrough and records the first-visit decision in the caller. */
  onClose: () => void;
  /** Ordered sections shown by the walkthrough. */
  steps: readonly PanelGuideStep[];
  /** Optional heading override for a surface-specific panel. */
  title?: string;
}

function stepMatchesLocation(step: PanelGuideStep, pathname: string, hash: string): boolean {
  if (!step.to) return false;
  const [path, stepHash] = step.to.split('#');
  return pathname === path && hash === (stepHash ? `#${stepHash}` : '');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getGuideCardStyle(targetRect: GuideRect | null) {
  const viewportWidth = Math.max(window.innerWidth || 360, 280);
  const viewportHeight = Math.max(window.innerHeight || 640, 480);
  const cardWidth = Math.min(380, Math.max(240, viewportWidth - 32));
  const cardHeight = Math.min(310, viewportHeight - 32);

  if (!targetRect) {
    return {
      top: '50%',
      left: '50%',
      width: cardWidth,
      transform: 'translate(-50%, -50%)',
    };
  }

  const margin = 16;
  const belowTop = targetRect.top + targetRect.height + margin;
  const aboveTop = targetRect.top - cardHeight - margin;
  const maxTop = Math.max(margin, viewportHeight - cardHeight - margin);
  const top =
    viewportHeight - belowTop >= cardHeight
      ? belowTop
      : targetRect.top - margin >= cardHeight
        ? aboveTop
        : clamp((viewportHeight - cardHeight) / 2, margin, maxTop);
  const left = clamp(
    targetRect.left + targetRect.width / 2 - cardWidth / 2,
    margin,
    Math.max(margin, viewportWidth - cardWidth - margin),
  );

  return { top, left, width: cardWidth };
}

/**
 * Small storage-aware controller used by panel shells.
 *
 * A missing key is intentionally treated as a first visit. If storage is
 * unavailable (private browsing or a restricted webview), the guide still
 * works for the current visit and can be replayed from the header.
 */
export function useFirstVisitPanelGuide(storageKey: string | null) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!storageKey) {
      setOpen(false);
      return;
    }

    try {
      setOpen(localStorage.getItem(storageKey) !== 'done');
    } catch {
      setOpen(true);
    }
  }, [storageKey]);

  const close = useCallback(() => {
    setOpen(false);
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, 'done');
    } catch {
      // The guide is still dismissed for this mounted session.
    }
  }, [storageKey]);

  const replay = useCallback(() => setOpen(true), []);

  return { open, close, replay };
}

/**
 * Accessible, route-aware first-run guide for panel surfaces.
 *
 * Each step navigates to its section, scrolls the matching
 * `[data-panel-guide="..."]` element into view, keeps that element sharp and
 * bold, and dims the rest of the viewport with a non-blocking spotlight. The
 * panel remains usable while the guide is open, so navigation can be explored
 * without the tour fighting the user's route choice.
 */
export function PanelOnboardingGuide({
  open,
  onClose,
  steps,
  title = 'راهنمای کامل پنل',
}: PanelOnboardingGuideProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<GuideRect | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);
  const pendingStepRef = useRef<number | null>(null);

  const current = steps[index] ?? steps[0];
  const isLast = index >= steps.length - 1;

  const clearActiveTarget = useCallback(() => {
    activeTargetRef.current?.removeAttribute('data-panel-guide-active');
    activeTargetRef.current = null;
  }, []);

  const findTarget = useCallback(() => {
    if (!current) return null;

    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>('[data-panel-guide]'),
    ).filter((element) => element.dataset.panelGuide === current.id);

    const visibleCandidates = candidates.filter((element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        (rect.width > 0 || rect.height > 0)
      );
    });
    const visible = visibleCandidates[0];

    // When the current route owns a matching page section, prefer it over the
    // duplicate sidebar/tab link. On other routes the navigation item is the
    // useful target while the guide is moving to the next section.
    const routeTarget = visibleCandidates.find((element) => element.closest('main'));
    const target = routeTarget ?? visible ?? candidates[0] ?? null;
    if (!target) return null;

    // Page roots can be several viewport-heights tall. Coach marks are more
    // useful beside their page header than as a spotlight around the whole
    // scroll pane, so focus the first visible header when available.
    const targetRect = target.getBoundingClientRect();
    const viewportHeight = Math.max(window.innerHeight || 640, 480);
    if (target.closest('main') && targetRect.height > viewportHeight * 1.5) {
      const header = target.querySelector<HTMLElement>('header');
      if (header) {
        const headerRect = header.getBoundingClientRect();
        if (headerRect.width > 0 && headerRect.height > 0) return header;
      }
    }

    return target;
  }, [current]);

  const readTargetRect = useCallback((element: HTMLElement): GuideRect => {
    const viewportWidth = Math.max(
      window.innerWidth || document.documentElement.clientWidth || 360,
      320,
    );
    const viewportHeight = Math.max(
      window.innerHeight || document.documentElement.clientHeight || 640,
      480,
    );
    const raw = element.getBoundingClientRect();
    const padding = 8;
    const width = Math.min(Math.max(raw.width + padding * 2, 48), viewportWidth - padding * 2);
    const height = Math.min(Math.max(raw.height + padding * 2, 48), viewportHeight - padding * 2);
    const left = clamp(
      raw.width ? raw.left - padding : (viewportWidth - width) / 2,
      padding,
      viewportWidth - width - padding,
    );
    const top = Math.min(
      Math.max((raw.height ? raw.top : 76) - padding, padding),
      viewportHeight - height - padding,
    );

    return { top, left, width, height };
  }, []);

  // If the user opened a deep panel link, start at that section so the guide
  // never unexpectedly changes the active route. Root-panel visits start at
  // the first section as usual.
  useEffect(() => {
    if (!open) {
      pendingStepRef.current = null;
      return;
    }

    const currentStepIndex = steps.findIndex((step) =>
      stepMatchesLocation(step, location.pathname, location.hash),
    );
    setIndex(currentStepIndex >= 0 ? currentStepIndex : 0);
  }, [open]);

  const goToStep = useCallback(
    (nextIndex: number) => {
      const nextStep = steps[nextIndex];
      if (!nextStep) {
        pendingStepRef.current = null;
        onClose();
        return;
      }

      pendingStepRef.current = nextIndex;
      setIndex(nextIndex);
      if (nextStep.to && !stepMatchesLocation(nextStep, location.pathname, location.hash)) {
        navigate(nextStep.to);
      }
    },
    [location.hash, location.pathname, navigate, onClose, steps],
  );

  // Keep the active step in sync when someone uses the panel navigation while
  // the coach mark is open. The tour's own navigation sets a pending index so
  // this effect does not briefly snap back to the old route during transition.
  useEffect(() => {
    if (!open) return;
    const routeStepIndex = steps.findIndex((step) =>
      stepMatchesLocation(step, location.pathname, location.hash),
    );
    if (pendingStepRef.current !== null) {
      if (pendingStepRef.current === routeStepIndex) {
        pendingStepRef.current = null;
      }
      return;
    }
    if (routeStepIndex >= 0 && routeStepIndex !== index) {
      setIndex(routeStepIndex);
    }
  }, [index, location.hash, location.pathname, open, steps]);

  // Find the target after route content has committed. A short bounded retry
  // covers lazy route chunks and data-dependent section rendering.
  useLayoutEffect(() => {
    clearActiveTarget();
    setTargetRect(null);
    if (!open || !current) return undefined;

    let cancelled = false;
    let frame = 0;
    let retryTimer = 0;
    let attempts = 0;
    let observer: ResizeObserver | null = null;

    const syncTarget = (target: HTMLElement) => {
      if (activeTargetRef.current !== target) {
        clearActiveTarget();
        activeTargetRef.current = target;
        target.setAttribute('data-panel-guide-active', 'true');
        observer?.observe(target);
      }
      frame = window.requestAnimationFrame(() => {
        if (!cancelled) setTargetRect(readTargetRect(target));
      });
    };

    const measure = (scrollIntoView: boolean) => {
      if (cancelled) return;
      const target = findTarget();
      if (!target) {
        if (attempts < 20) {
          attempts += 1;
          retryTimer = window.setTimeout(() => measure(false), 80);
        }
        return;
      }

      syncTarget(target);
      if (scrollIntoView && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      }

      // Route content may replace its loading root after the first paint.
      // Re-resolve target for a short bounded window so the spotlight follows
      // the committed element instead of falling back to a stale rectangle.
      if (attempts < 8) {
        attempts += 1;
        retryTimer = window.setTimeout(() => measure(false), 80);
      }
    };

    frame = window.requestAnimationFrame(() => {
      measure(true);
    });
    const update = () => {
      const target = activeTargetRef.current;
      if (cancelled) return;
      if (target?.isConnected) {
        setTargetRect(readTargetRect(target));
      } else {
        measure(false);
      }
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (activeTargetRef.current) observer?.observe(activeTargetRef.current);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(retryTimer);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      observer?.disconnect();
      clearActiveTarget();
    };
  }, [
    clearActiveTarget,
    current,
    findTarget,
    location.hash,
    location.pathname,
    open,
    readTargetRect,
  ]);

  // Keep keyboard users in the guide and return focus to the trigger context.
  useEffect(() => {
    if (!open) {
      const previous = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (previous && document.contains(previous)) previous.focus();
      return undefined;
    }

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (!isLast) goToStep(index + 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (index > 0) goToStep(index - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToStep, index, isLast, open]);

  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [index, open]);

  if (!open || !current || steps.length === 0) return null;

  const targetStyle = targetRect
    ? {
        top: targetRect.top,
        left: targetRect.left,
        width: targetRect.width,
        height: targetRect.height,
      }
    : undefined;
  const cardStyle = getGuideCardStyle(targetRect);

  return (
    <div
      className="panel-onboarding-guide fixed inset-0 z-dialog"
      data-testid="panel-onboarding-guide"
    >
      {targetRect ? (
        <div aria-hidden="true" className="panel-onboarding-guide__spotlight" style={targetStyle} />
      ) : (
        <div
          aria-hidden="true"
          className="panel-onboarding-guide__scrim panel-onboarding-guide__scrim--full"
        />
      )}

      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="panel-guide-title"
        aria-describedby="panel-guide-body"
        ref={dialogRef}
        className="panel-onboarding-guide__card"
        style={cardStyle}
        data-testid="panel-guide-dialog"
      >
        <div className="panel-onboarding-guide__card-head">
          <div className="panel-onboarding-guide__brand">
            <span className="panel-onboarding-guide__brand-icon" aria-hidden="true">
              <CircleHelp className="h-4 w-4" />
            </span>
            <div>
              <p className="panel-onboarding-guide__eyebrow">{title}</p>
              <p className="panel-onboarding-guide__progress" aria-live="polite">
                مرحله {toPersianDigits(String(index + 1))} از{' '}
                {toPersianDigits(String(steps.length))}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="بستن راهنما"
            className="panel-onboarding-guide__close"
            data-testid="panel-guide-close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span>بستن</span>
          </button>
        </div>

        <div className="panel-onboarding-guide__steps" aria-hidden="true">
          {steps.map((step, stepIndex) => (
            <span
              key={step.id}
              className={cn(
                'panel-onboarding-guide__step',
                stepIndex <= index && 'panel-onboarding-guide__step--active',
              )}
            />
          ))}
        </div>

        <p className="panel-onboarding-guide__step-label">{current.eyebrow ?? 'راهنمای بخش'}</p>
        <h2 id="panel-guide-title" className="panel-onboarding-guide__title">
          {current.title}
        </h2>
        <p id="panel-guide-body" className="panel-onboarding-guide__body">
          {current.body}
        </p>

        <div className="panel-onboarding-guide__actions">
          <button
            type="button"
            onClick={() => {
              if (index > 0) goToStep(index - 1);
            }}
            disabled={index === 0}
            className="panel-onboarding-guide__secondary"
            data-testid="panel-guide-previous"
          >
            <ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            قبلی
          </button>
          <button
            type="button"
            onClick={() => (isLast ? onClose() : goToStep(index + 1))}
            className="panel-onboarding-guide__primary"
            data-testid="panel-guide-next"
          >
            {isLast ? 'شروع کار' : 'بخش بعدی'}
            {!isLast && <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />}
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="panel-onboarding-guide__disable"
          data-testid="panel-guide-disable-auto-start"
        >
          دیگر خودکار نمایش نده
        </button>
      </section>
    </div>
  );
}
