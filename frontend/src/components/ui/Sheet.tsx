import { forwardRef } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeScope } from '../theme/ThemeProvider';
import { cn } from './cn';
import { IconButton } from './IconButton';

/**
 * Sheet / Drawer built on Radix Dialog. Inherits the full modal a11y contract
 * (focus trap, focus restore, `Esc` + overlay close, `role="dialog"` +
 * `aria-modal`, `aria-labelledby`) from Radix (ui-ux §10, R2.5).
 *
 * On mobile it presents as a **bottom sheet** (slot/date pickers per the design
 * inventory) and is **safe-area aware**, padding the bottom by
 * `env(safe-area-inset-bottom)` so content clears the home indicator
 * (ui-ux §5). At `sm` and up it docks to the inline-end as a side drawer.
 */
export const Sheet = RadixDialog.Root;
export const SheetTrigger = RadixDialog.Trigger;
export const SheetClose = RadixDialog.Close;

export const SheetTitle = forwardRef<
  React.ElementRef<typeof RadixDialog.Title>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Title>
>(function SheetTitle({ className, ...rest }, ref) {
  return (
    <RadixDialog.Title
      ref={ref}
      className={cn('text-lg font-medium text-text', className)}
      {...rest}
    />
  );
});

export const SheetDescription = forwardRef<
  React.ElementRef<typeof RadixDialog.Description>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Description>
>(function SheetDescription({ className, ...rest }, ref) {
  return (
    <RadixDialog.Description
      ref={ref}
      className={cn('mt-1 text-sm text-muted', className)}
      {...rest}
    />
  );
});

export type SheetSide = 'bottom' | 'inline-end';

export interface SheetContentProps extends React.ComponentPropsWithoutRef<
  typeof RadixDialog.Content
> {
  /**
   * Placement. `bottom` (default) is a bottom sheet on all sizes; `inline-end`
   * is a bottom sheet on mobile that becomes a side drawer at `sm`+.
   */
  side?: SheetSide;
  /** Show the default close (✕) button. Defaults to true. */
  showCloseButton?: boolean;
  /** Accessible label for the default close button. */
  closeLabel?: string;
}

const bottomClasses = cn(
  'inset-x-0 bottom-0 w-full',
  'rounded-t-lg border-t border-border',
  // Clear the home-indicator / notch on mobile (ui-ux §5).
  'pb-[max(var(--space-5),env(safe-area-inset-bottom))]',
);

const inlineEndClasses = cn(
  // Mobile: behaves like a bottom sheet…
  'inset-x-0 bottom-0 w-full rounded-t-lg border-t border-border',
  'pb-[max(var(--space-5),env(safe-area-inset-bottom))]',
  // …promoting to an inline-end side drawer from `sm` up.
  'sm:inset-y-0 sm:bottom-auto sm:start-auto sm:end-0 sm:h-full sm:w-80',
  'sm:rounded-t-none sm:rounded-s-lg sm:border-t-0 sm:border-s sm:pb-5',
);

export const SheetContent = forwardRef<
  React.ElementRef<typeof RadixDialog.Content>,
  SheetContentProps
>(function SheetContent(
  { className, children, side = 'bottom', showCloseButton = true, closeLabel, ...rest },
  ref,
) {
  const { t } = useTranslation();
  const scopeTheme = useThemeScope();
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay
        data-theme={scopeTheme}
        className={cn(
          'fixed inset-0 z-overlay bg-overlay',
          'motion-safe:data-[state=open]:animate-fade-in',
          'motion-safe:data-[state=closed]:animate-fade-out',
        )}
      />
      <RadixDialog.Content
        ref={ref}
        // Radix isolates the modal via `aria-hidden` on siblings; we also set
        // `aria-modal` explicitly so the modal contract is announced directly
        // on the sheet (ui-ux §10, R2.5).
        aria-modal="true"
        data-theme={scopeTheme}
        className={cn(
          'fixed z-dialog bg-elevated p-5 text-text shadow-3 outline-none',
          'max-h-[90dvh] overscroll-contain overflow-y-auto',
          // Enter: bottom sheets slide up (`toast-in`), side drawers slide in
          // from the inline-end; exits are an opacity fade. All motion-safe
          // gated and clamped globally under prefers-reduced-motion.
          side === 'bottom'
            ? 'motion-safe:data-[state=open]:animate-toast-in'
            : 'motion-safe:data-[state=open]:animate-slide-in-end',
          'motion-safe:data-[state=closed]:animate-fade-out',
          side === 'bottom' ? bottomClasses : inlineEndClasses,
          className,
        )}
        {...rest}
      >
        {children}
        {showCloseButton && (
          <RadixDialog.Close asChild>
            <IconButton
              aria-label={closeLabel ?? t('common.close', 'بستن')}
              variant="ghost"
              className="!absolute end-2 top-2 h-9 min-h-0 w-9 min-w-0"
            >
              <X className="h-5 w-5" />
            </IconButton>
          </RadixDialog.Close>
        )}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
});
