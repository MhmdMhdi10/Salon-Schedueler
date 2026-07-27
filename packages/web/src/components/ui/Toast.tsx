import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import * as RadixToast from '@radix-ui/react-toast';
import { CheckCircle2, Info, XCircle, X, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeScope } from '../theme/ThemeProvider';
import { cn } from './cn';
import { IconButton } from './IconButton';

export type ToastStatus = 'success' | 'info' | 'error';

export interface ToastOptions {
  /** Main message line. */
  title: React.ReactNode;
  /** Optional supporting line below the title. */
  description?: React.ReactNode;
  /** Status — drives color, icon, and the ARIA live-region type. Defaults to `info`. */
  status?: ToastStatus;
  /**
   * Optional undo affordance. When provided, an action button labelled
   * `undo.label` (default «بازگردانی») is shown; clicking it calls `onUndo` and
   * dismisses the toast. Use for destructive/owner actions (ui-ux §1 forgiveness).
   */
  onUndo?: () => void;
  /** Override the undo button label. */
  undoLabel?: string;
  /** Auto-dismiss duration in ms. Defaults to the provider duration. */
  duration?: number;
}

interface ToastRecord extends ToastOptions {
  id: number;
  open: boolean;
}

interface ToastContextValue {
  /** Show a toast. Returns its id (so callers can dismiss it early if needed). */
  toast: (options: ToastOptions) => number;
  /** Convenience wrappers. */
  success: (options: Omit<ToastOptions, 'status'>) => number;
  info: (options: Omit<ToastOptions, 'status'>) => number;
  error: (options: Omit<ToastOptions, 'status'>) => number;
  /** Imperatively dismiss a toast by id. */
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Hook to show toasts imperatively. Must be used within a `ToastProvider`.
 *
 *   const { success } = useToast();
 *   success({ title: 'کد ارسال شد' });
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return ctx;
}

const statusIcon: Record<ToastStatus, LucideIcon> = {
  success: CheckCircle2,
  info: Info,
  error: XCircle,
};

const statusAccent: Record<ToastStatus, string> = {
  success: 'text-success',
  info: 'text-info',
  error: 'text-danger',
};

/**
 * Map status → Radix live-region semantics: errors are assertive (`role=alert`,
 * `aria-live=assertive`); success/info are polite (`role=status`,
 * `aria-live=polite`). This satisfies R2.10 / ui-ux §10 — toasts are perceivable
 * without sight.
 */
function toastType(status: ToastStatus): RadixToast.ToastProps['type'] {
  return status === 'error' ? 'foreground' : 'background';
}

export interface ToastProviderProps {
  children: React.ReactNode;
  /** Default auto-dismiss duration (ms). Defaults to 5000. */
  duration?: number;
  /** Swipe direction to dismiss. Defaults to `right` (toward inline-end in RTL). */
  swipeDirection?: RadixToast.ToastProviderProps['swipeDirection'];
}

/**
 * Toast system built on Radix Toast. Wrap the app (or a subtree) once; the
 * `useToast` hook then shows toasts from anywhere below.
 *
 * - Live-region announce: Radix renders the viewport as an `aria-live` region;
 *   error toasts announce assertively, success/info politely (R2.10).
 * - Optional undo action («بازگردانی») for forgiving destructive flows.
 * - Token-only styling; enter/exit animation is transform/opacity and is
 *   neutralized under `prefers-reduced-motion` (tokens.css).
 */
export function ToastProvider({
  children,
  duration = 5000,
  swipeDirection = 'right',
}: ToastProviderProps) {
  // `t` is taken by the toast record in the render map, so alias the i18n fn.
  const { t: translate } = useTranslation();
  const scopeTheme = useThemeScope();
  const undoFallback = translate('common.undo', 'بازگردانی');
  const closeFallback = translate('common.close', 'بستن');
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, open: false } : t)));
      // Drop from state after the close transition settles so the exit
      // crossfade can play (and is a no-op under reduced motion).
      window.setTimeout(() => remove(id), 200);
    },
    [remove],
  );

  const toast = useCallback((options: ToastOptions) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { ...options, id, open: true }]);
    return id;
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (o) => toast({ ...o, status: 'success' }),
      info: (o) => toast({ ...o, status: 'info' }),
      error: (o) => toast({ ...o, status: 'error' }),
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider duration={duration} swipeDirection={swipeDirection}>
        {children}
        {toasts.map((t) => {
          const status = t.status ?? 'info';
          const Icon = statusIcon[status];
          return (
            <RadixToast.Root
              key={t.id}
              type={toastType(status)}
              duration={t.duration}
              open={t.open}
              onOpenChange={(open) => {
                if (!open) dismiss(t.id);
              }}
              className={cn(
                'flex items-start gap-3 rounded-md border border-border bg-elevated p-3 shadow-3',
                'transition-opacity duration-base ease-standard',
                'data-[state=closed]:opacity-0',
                // Slide-up entrance from the bottom edge (token keyframe);
                // exit stays the opacity crossfade above. Motion-safe gated
                // and clamped globally under prefers-reduced-motion.
                'motion-safe:animate-toast-in',
              )}
            >
              <span
                className={cn('mt-0.5 inline-flex shrink-0', statusAccent[status])}
                aria-hidden="true"
              >
                <Icon className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <RadixToast.Title className="text-sm font-medium text-text">
                  {t.title}
                </RadixToast.Title>
                {t.description && (
                  <RadixToast.Description className="mt-1 text-2xs text-muted">
                    {t.description}
                  </RadixToast.Description>
                )}
              </div>
              {t.onUndo && (
                <RadixToast.Action
                  asChild
                  altText={t.undoLabel ?? undoFallback}
                  onClick={() => {
                    t.onUndo?.();
                    dismiss(t.id);
                  }}
                >
                  <button
                    type="button"
                    className={cn(
                      'shrink-0 rounded-sm px-2 py-1 text-2xs font-medium text-primary',
                      'transition-colors duration-fast ease-standard hover:bg-surface',
                      'outline-none focus-visible:outline focus-visible:outline-2',
                      'focus-visible:outline-offset-2 focus-visible:outline-focus',
                    )}
                  >
                    {t.undoLabel ?? undoFallback}
                  </button>
                </RadixToast.Action>
              )}
              <RadixToast.Close asChild>
                <IconButton
                  aria-label={closeFallback}
                  variant="ghost"
                  className="h-8 min-h-0 w-8 min-w-0 shrink-0"
                >
                  <X className="h-4 w-4" />
                </IconButton>
              </RadixToast.Close>
            </RadixToast.Root>
          );
        })}
        <RadixToast.Viewport
          data-theme={scopeTheme}
          className={cn(
            'fixed bottom-0 z-toast m-0 flex w-full max-w-sm list-none flex-col gap-2 p-4',
            // Clear the home indicator / notch on standalone-PWA phones.
            'pb-[max(var(--space-4),env(safe-area-inset-bottom))]',
            // Anchor to the inline-start so it sits correctly in RTL.
            'start-0 outline-none',
          )}
        />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
