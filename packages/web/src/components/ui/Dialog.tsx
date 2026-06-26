import { forwardRef } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
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

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof RadixDialog.Content> {
  /** Show the default inline-end close (✕) button. Defaults to true. */
  showCloseButton?: boolean;
  /** Accessible label for the default close button. */
  closeLabel?: string;
}

/**
 * Centered modal panel with overlay. The overlay sits on `--z-overlay` and the
 * content on `--z-dialog` per the z-index ladder (ui-ux §2). Enter/exit use
 * opacity (reduced-motion safe — no layout-shifting animation).
 */
export const DialogContent = forwardRef<
  React.ElementRef<typeof RadixDialog.Content>,
  DialogContentProps
>(function DialogContent(
  { className, children, showCloseButton = true, closeLabel = 'بستن', ...rest },
  ref,
) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay
        className="fixed inset-0 z-overlay bg-black/50"
      />
      <RadixDialog.Content
        ref={ref}
        // Radix isolates the modal via `aria-hidden` on siblings; we also set
        // `aria-modal` explicitly so the modal contract is announced directly
        // on the dialog (ui-ux §10, R2.5).
        aria-modal="true"
        className={cn(
          'fixed inset-x-0 top-1/2 z-dialog mx-auto -translate-y-1/2',
          'w-[calc(100%-var(--space-8))] max-w-md',
          'rounded-lg border border-border bg-elevated p-5 text-text shadow-3',
          'outline-none',
          className,
        )}
        {...rest}
      >
        {children}
        {showCloseButton && (
          <RadixDialog.Close asChild>
            <IconButton
              aria-label={closeLabel}
              variant="ghost"
              className="absolute end-2 top-2 h-9 min-h-0 w-9 min-w-0"
            >
              <X className="h-5 w-5" />
            </IconButton>
          </RadixDialog.Close>
        )}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
});
