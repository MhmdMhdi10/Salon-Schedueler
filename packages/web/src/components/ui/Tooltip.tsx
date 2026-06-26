import { forwardRef } from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { cn } from './cn';

/**
 * Tooltip built on Radix Tooltip. Reachable by **keyboard focus** (not only
 * hover) so it satisfies ui-ux §10 / R2.9, and it must never be the sole source
 * of critical information (per the design inventory). Wrap an app region once in
 * `TooltipProvider` (or rely on the per-tooltip provider here).
 *
 * Usage:
 *   <Tooltip content="حذف نوبت">
 *     <IconButton aria-label="حذف نوبت"><Trash /></IconButton>
 *   </Tooltip>
 */
export const TooltipProvider = RadixTooltip.Provider;

export interface TooltipProps
  extends Pick<
    React.ComponentPropsWithoutRef<typeof RadixTooltip.Root>,
    'open' | 'defaultOpen' | 'onOpenChange' | 'delayDuration'
  > {
  /** The tooltip body text/content. */
  content: React.ReactNode;
  /** The trigger element (must accept a ref / forward props — uses `asChild`). */
  children: React.ReactNode;
  /** Preferred side of the trigger to render on. */
  side?: React.ComponentPropsWithoutRef<typeof RadixTooltip.Content>['side'];
  /** Tooltip content className. */
  className?: string;
}

export const Tooltip = forwardRef<
  React.ElementRef<typeof RadixTooltip.Content>,
  TooltipProps
>(function Tooltip(
  {
    content,
    children,
    side = 'top',
    className,
    open,
    defaultOpen,
    onOpenChange,
    delayDuration,
  },
  ref,
) {
  return (
    <RadixTooltip.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      delayDuration={delayDuration}
    >
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          ref={ref}
          side={side}
          sideOffset={6}
          className={cn(
            'z-overlay max-w-xs rounded-sm bg-text px-2 py-1 text-2xs text-bg shadow-2',
            'select-none',
            className,
          )}
        >
          {content}
          <RadixTooltip.Arrow className="fill-text" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
});
