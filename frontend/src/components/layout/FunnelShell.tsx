import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { Num } from '../ui/Num';
import { Avatar } from '../ui/Avatar';
import { cn } from '../ui/cn';

import './funnel-shell.css';

/** Stable id the funnel `<main>` exposes (skip-link target / focus). */
export const FUNNEL_CONTENT_ID = 'funnel-content';

/** The four ordered steps of the booking funnel (ui-ux §8). */
export const FUNNEL_STEPS = ['service', 'date', 'time', 'confirm'] as const;

/** A single funnel step key. */
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export interface FunnelShellProps {
  /** Routed funnel step content rendered inside the centered card. */
  children: React.ReactNode;
  /**
   * The active step (1-based index into {@link FUNNEL_STEPS}) — drives the
   * stepper's current/complete styling and the `aria-current` marker.
   */
  currentStep: FunnelStep;
  /** Salon name shown in the minimal top bar. Falls back to the app title. */
  salonName?: string;
  /**
   * The salon's configured display name (R4.5). When present it is the primary
   * brand mark, taking precedence over `salonName`.
   */
  displayName?: string;
  /** Optional salon logo shown beside the brand mark (R4.5). */
  logoUrl?: string;
  /**
   * Optional back handler. When provided a back affordance is shown in the top
   * bar. In RTL the chevron points inline-start (visually right), per ui-ux §8.
   */
  onBack?: () => void;
  /**
   * Sticky bottom CTA content (e.g. the funnel's primary action). Rendered in a
   * bar pinned to the thumb zone that clears `env(safe-area-inset-bottom)`.
   */
  cta?: React.ReactNode;
  /** Optional className applied to the outermost shell element. */
  className?: string;
}

/**
 * Customer **funnel shell** (R3.1, R3.2, R3.6; ui-ux §5, §8).
 *
 * The booking funnel (QR → book → confirm → success) is the revenue path, so
 * this shell is deliberately minimal and distinct from both the public and the
 * admin shells:
 *
 *  - a **minimal top bar** with the salon name and an optional back affordance
 *    (no global nav, no theme clutter competing with the primary action);
 *  - a **stepper** progress indicator (۱ خدمت · ۲ تاریخ · ۳ زمان · ۴ تایید) that
 *    shows where the user is without losing state on back;
 *  - a **centered content card** capped at ≈480px (`max-w-funnel`) so the form
 *    never stretches uncomfortably wide;
 *  - a **sticky bottom CTA bar** in the thumb zone that clears the device safe
 *    area inset so the primary action is always reachable one-handed.
 *
 * Layout is RTL-first (logical properties only). The `dir="rtl"`/`lang="fa"`
 * document contract lives on the app root wrapper.
 */
export function FunnelShell({
  children,
  currentStep,
  salonName,
  displayName,
  logoUrl,
  onBack,
  cta,
  className,
}: FunnelShellProps) {
  const { t } = useTranslation();
  const currentIndex = FUNNEL_STEPS.indexOf(currentStep);
  const total = FUNNEL_STEPS.length;

  // R4.5: render the salon as the primary brand mark (`displayName ?? name`),
  // with its logo when present; the platform identifier is demoted to a
  // subordinate byline. With no salon identity we fall back to the app title.
  const brandMark = (displayName ?? salonName)?.trim() || undefined;

  return (
    <div
      data-shell="funnel"
      className={cn(
        'funnel-shell flex min-h-screen min-h-[100dvh] flex-col overflow-x-clip bg-bg text-text',
        className,
      )}
    >
      {/* Minimal top bar: back affordance (inline-start) + salon name. */}
      <header className="border-b border-border bg-elevated" dir="rtl">
        <div className="relative mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-2 px-3 sm:gap-5 sm:px-4">
          {brandMark ? (
            <div className="flex min-w-0 max-w-[38%] items-center gap-2 sm:max-w-[32%]">
              {logoUrl ? <Avatar src={logoUrl} name={brandMark} size="sm" decorative /> : null}
              <span className="flex min-w-0 flex-col leading-tight">
                <span data-funnel-brand-mark className="truncate text-md font-bold text-text">
                  {brandMark}
                </span>
                {/* Subordinate platform byline (R4.5). */}
                <span className="truncate text-2xs font-medium text-muted">{t('app.title')}</span>
              </span>
            </div>
          ) : (
            <span className="min-w-0 max-w-[38%] truncate text-md font-bold text-text sm:max-w-[32%]">
              {t('app.title')}
            </span>
          )}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <div className="flex w-[min(64%,18rem)] gap-1">
              {FUNNEL_STEPS.map((step, index) => (
                <span
                  key={step}
                  className={cn(
                    'h-1 flex-1 rounded-pill',
                    index <= currentIndex ? 'bg-primary' : 'bg-border',
                  )}
                />
              ))}
            </div>
          </div>
          {onBack ? (
            <IconButton aria-label={t('funnel.back')} onClick={onBack} className="shrink-0">
              {/* RTL-native: back affordance points visually to the right. */}
              <ChevronRight className="h-5 w-5" />
            </IconButton>
          ) : (
            <span className="size-10" aria-hidden="true" />
          )}
        </div>
      </header>

      {/* Stepper progress indicator (ui-ux §8). An ordered list communicates
          sequence; aria-current marks the active step for AT. */}
      <nav aria-label={t('funnel.progress')} className="sr-only">
        <ol>
          {FUNNEL_STEPS.map((step, index) => {
            const isComplete = index < currentIndex;
            const isCurrent = index === currentIndex;
            return (
              <li
                key={step}
                aria-current={isCurrent ? 'step' : undefined}
                className="flex items-center gap-2"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-pill text-xs font-bold',
                    isCurrent && 'bg-primary text-primary-contrast',
                    isComplete && 'bg-secondary text-primary-contrast',
                    !isCurrent && !isComplete && 'border border-border bg-bg text-muted',
                  )}
                >
                  <Num value={index + 1} />
                </span>
                <span
                  className={cn(
                    'truncate text-xs',
                    isCurrent ? 'font-bold text-text' : 'text-muted',
                  )}
                >
                  {t(`funnel.steps.${step}`)}
                </span>
              </li>
            );
          })}
        </ol>
        {/* A concise textual position for screen readers / small viewports. */}
        <p className="sr-only">{t('funnel.stepLabel', { current: currentIndex + 1, total })}</p>
      </nav>

      {/* Centered Booksy-style form column. */}
      <main
        id={FUNNEL_CONTENT_ID}
        tabIndex={-1}
        dir="rtl"
        className={cn(
          'mx-auto w-full max-w-2xl flex-1 px-3 py-6 sm:px-4 sm:py-10',
          // Reserve room so the sticky CTA never covers the card's tail.
          cta && 'funnel-content-with-cta pb-[calc(var(--space-10)+env(safe-area-inset-bottom))]',
        )}
      >
        {children}
      </main>

      {/* Sticky bottom CTA bar in the thumb zone, clearing the safe-area. */}
      {cta ? (
        <div
          data-testid="funnel-cta-bar"
          className={cn(
            'funnel-cta-bar sticky bottom-0 z-sticky border-t border-border bg-surface',
            'pb-[env(safe-area-inset-bottom)]',
          )}
        >
          <div className="mx-auto w-full max-w-2xl px-3 py-3 sm:px-4">{cta}</div>
        </div>
      ) : null}
    </div>
  );
}

export default FunnelShell;
