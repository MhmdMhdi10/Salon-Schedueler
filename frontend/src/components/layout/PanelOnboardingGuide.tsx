import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../ui/cn';

import './panel-onboarding-guide.css';

/** One stop in a panel walkthrough. `to` moves the user to the section. */
export interface PanelGuideStep {
  id: string;
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
 * bold, and blurs/dims the rest of the viewport with four scrim panes. The
 * scrim is split around the target instead of using a full-screen filter so
 * the highlighted section remains readable on mobile and desktop.
 */
export function PanelOnboardingGuide({
  open,
  onClose,
  steps,
  title = 'راهنمای شروع پنل',
}: PanelOnboardingGuideProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<GuideRect | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);
  const openingAtCurrentSectionRef = useRef(false);

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
    return routeTarget ?? visible ?? candidates[0] ?? null;
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
    const padding = 6;
    const width = Math.min(
      Math.max(raw.width + padding * 2, 48),
      viewportWidth - padding * 2,
    );
    const height = Math.min(
      Math.max(raw.height + padding * 2, 48),
      viewportHeight - padding * 2,
    );
    const left = Math.min(
      Math.max((raw.width ? raw.left : (viewportWidth - width) / 2) - padding, padding),
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
      openingAtCurrentSectionRef.current = false;
      return;
    }

    const currentStepIndex = steps.findIndex((step) =>
      stepMatchesLocation(step, location.pathname, location.hash),
    );
    openingAtCurrentSectionRef.current = currentStepIndex > 0;
    setIndex(currentStepIndex >= 0 ? currentStepIndex : 0);
  }, [open]);

  // Move through real panel sections as the user advances the walkthrough.
  useEffect(() => {
    if (!open || !current?.to) return;
    // The opening render still has index 0 while the effect above aligns it
    // with a deep-linked section. Wait one render before navigating.
    if (openingAtCurrentSectionRef.current) {
      openingAtCurrentSectionRef.current = false;
      return;
    }
    const [path, hash] = current.to.split('#');
    const expectedHash = hash ? `#${hash}` : '';
    if (location.pathname !== path || location.hash !== expectedHash) {
      navigate(current.to);
    }
  }, [current?.to, location.hash, location.pathname, navigate, open]);

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

      activeTargetRef.current = target;
      target.setAttribute('data-panel-guide-active', 'true');
      if (scrollIntoView && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      }
      frame = window.requestAnimationFrame(() => {
        if (!cancelled) setTargetRect(readTargetRect(target));
      });
    };

    frame = window.requestAnimationFrame(() => measure(true));
    const update = () => {
      const target = activeTargetRef.current;
      if (target && !cancelled) setTargetRect(readTargetRect(target));
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(retryTimer);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      clearActiveTarget();
    };
  }, [clearActiveTarget, current, findTarget, location.hash, location.pathname, open, readTargetRect]);

  // Keep keyboard users in the guide and return focus to the trigger context.
  useEffect(() => {
    if (!open) {
      const previous = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (previous && document.contains(previous)) previous.focus();
      return undefined;
    }

    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
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

  if (!open || !current || steps.length === 0) return null;

  const targetStyle = targetRect
    ? {
        top: targetRect.top,
        left: targetRect.left,
        width: targetRect.width,
        height: targetRect.height,
      }
    : undefined;

  return (
    <div className="panel-onboarding-guide fixed inset-0 z-dialog" data-testid="panel-onboarding-guide">
      {targetRect ? (
        <>
          <div
            aria-hidden="true"
            className="panel-onboarding-guide__scrim panel-onboarding-guide__scrim--top"
            style={{ height: targetRect.top }}
          />
          <div
            aria-hidden="true"
            className="panel-onboarding-guide__scrim panel-onboarding-guide__scrim--start"
            style={{
              top: targetRect.top,
              width: targetRect.left,
              height: targetRect.height,
            }}
          />
          <div
            aria-hidden="true"
            className="panel-onboarding-guide__scrim panel-onboarding-guide__scrim--end"
            style={{
              top: targetRect.top,
              left: targetRect.left + targetRect.width,
              height: targetRect.height,
            }}
          />
          <div
            aria-hidden="true"
            className="panel-onboarding-guide__scrim panel-onboarding-guide__scrim--bottom"
            style={{ top: targetRect.top + targetRect.height }}
          />
          <div
            aria-hidden="true"
            className="panel-onboarding-guide__focus"
            style={targetStyle}
          />
        </>
      ) : (
        <div
          aria-hidden="true"
          className="panel-onboarding-guide__scrim panel-onboarding-guide__scrim--full"
        />
      )}

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-guide-title"
        aria-describedby="panel-guide-body"
        ref={dialogRef}
        className="panel-onboarding-guide__card"
        data-testid="panel-guide-dialog"
      >
        <div className="panel-onboarding-guide__card-head">
          <div>
            <p className="panel-onboarding-guide__eyebrow">{title}</p>
            <p className="panel-onboarding-guide__progress" aria-live="polite">
              مرحله {index + 1} از {steps.length}
            </p>
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

        <h2 id="panel-guide-title" className="panel-onboarding-guide__title">
          {current.title}
        </h2>
        <p id="panel-guide-body" className="panel-onboarding-guide__body">
          {current.body}
        </p>

        <div className="panel-onboarding-guide__actions">
          <button
            type="button"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={index === 0}
            className="panel-onboarding-guide__secondary"
            data-testid="panel-guide-previous"
          >
            <ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            قبلی
          </button>
          <button
            type="button"
            onClick={() => (isLast ? onClose() : setIndex((value) => value + 1))}
            className="panel-onboarding-guide__primary"
            data-testid="panel-guide-next"
          >
            {isLast ? 'شروع کار' : 'بخش بعدی'}
            {!isLast && <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />}
          </button>
        </div>
      </section>
    </div>
  );
}
