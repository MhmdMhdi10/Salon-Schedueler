import { forwardRef } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeScope } from '../theme/ThemeProvider';
import { cn } from './cn';
import { IconButton } from './IconButton';

/**
 * Modal dialog built on Radix Dialog. Radix provides the non-negotiable a11y
 * behaviours required by ui-ux §10 / R2.5 out of the box:
 *  - focus trap while open, focus restore to the trigger on close
 *  - `Esc` closes, overlay click closes (both can be opted out per instance)
 *  - `role="dialog"` + `aria-modal="true"` on the content
 *  - labelled via `aria-labelledby` (wire `DialogTitle`) and optionally
 *    described via `aria-describedby` (`DialogDescription`)
 *
 * Composition mirrors Radix so callers stay flexible:
 *   <Dialog>
 *     <DialogTrigger asChild><Button>…</Button></DialogTrigger>
 *     <DialogContent>
 *       <DialogTitle>…</DialogTitle>
 *       <DialogDescription>…</DialogDescription>
 *       …
 *       <DialogClose asChild><Button>…</Button></DialogClose>
 *     </DialogContent>
 *   </Dialog>
 */
export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;
export const DialogPortal = RadixDialog.Portal;

export const DialogTitle = forwardRef<
  React.ElementRef<typeof RadixDialog.Title>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Title>
>(function DialogTitle({ className, ...rest }, ref) {
  return (
    <RadixDialog.Title
      ref={ref}
      className={cn('text-lg font-medium text-text', className)}
      {...rest}
    />
  );
});

export const DialogDescription = forwardRef<
  React.ElementRef<typeof RadixDialog.Description>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Description>
>(function DialogDescription({ className, ...rest }, ref) {
  return (
    <RadixDialog.Description
      ref={ref}
      className={cn('mt-1 text-sm text-muted', className)}
      {...rest}
    />
  );
});

export interface DialogContentProps extends React.ComponentPropsWithoutRef<
  typeof RadixDialog.Content
> {
  /** Show the default inline-end close (✕) button. Defaults to true. */
  showCloseButton?: boolean;
  /** Accessible label for the default close button. Defaults to `common.close`. */
  closeLabel?: string;
}

/**
 * Centered modal panel with overlay. The overlay sits on `--z-overlay` and the
 * content on `--z-dialog` per the z-index ladder (ui-ux §2).
 *
 * Motion: overlay fades, panel scale-fades in and opacity-led-exits — the
 * token keyframes (`fade-in`/`scale-in`/`fade-out`/`scale-out`) run only under
 * `motion-safe:` and are additionally clamped by the global reduced-motion
 * block in `tokens.css`.
 *
 * Tall content: the panel caps at the small-viewport height minus breathing
 * room and scrolls internally, so action buttons never clip off-screen on
 * 360×640 phones (matches the Sheet pattern).
 *
 * Theme scope: the portal root re-stamps the nearest `ThemeScope` theme (owner
 * panel tenant theming) so a dialog opened from a dark-scoped subtree renders
 * dark even though it portals to `document.body`.
 */
export const DialogContent = forwardRef<
  React.ElementRef<typeof RadixDialog.Content>,
  DialogContentProps
>(function DialogContent(
  { className, children, showCloseButton = true, closeLabel, ...rest },
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
        // on the dialog (ui-ux §10, R2.5).
        aria-modal="true"
        data-theme={scopeTheme}
        className={cn(
          // inset-0 + m-auto + h-fit centers without a transform, so the
          // scale-in/out keyframes (which own `transform`) cannot knock the
          // panel off-center mid-animation.
          'fixed inset-0 z-dialog m-auto h-fit',
          'w-[calc(100%-var(--space-8))] max-w-md',
          'max-h-[calc(100dvh-var(--space-10))] overscroll-contain overflow-y-auto',
          'rounded-lg border border-border bg-elevated p-5 text-text shadow-3',
          'outline-none',
          'motion-safe:data-[state=open]:animate-scale-in',
          'motion-safe:data-[state=closed]:animate-fade-out',
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
