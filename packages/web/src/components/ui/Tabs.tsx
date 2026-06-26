import { forwardRef } from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from './cn';

/**
 * Tabs built on Radix Tabs. Roving-tabindex arrow-key navigation is handled by
 * Radix and is **RTL-aware**: with `dir="rtl"` on the document the Left/Right
 * arrows swap meaning automatically, so keyboard nav stays intuitive
 * (ui-ux §11, R2.9). Used for the calendar day/week toggle — the underlying
 * `role="tab"` / `aria-selected` semantics are preserved by Radix, keeping the
 * existing admin test hooks valid.
 *
 * Composition mirrors Radix:
 *   <Tabs defaultValue="day">
 *     <TabsList>
 *       <TabsTrigger value="day">روز</TabsTrigger>
 *       <TabsTrigger value="week">هفته</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="day">…</TabsContent>
 *     <TabsContent value="week">…</TabsContent>
 *   </Tabs>
 */
export const Tabs = RadixTabs.Root;

export const TabsList = forwardRef<
  React.ElementRef<typeof RadixTabs.List>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.List>
>(function TabsList({ className, ...rest }, ref) {
  return (
    <RadixTabs.List
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border bg-surface p-1',
        className,
      )}
      {...rest}
    />
  );
});

export const TabsTrigger = forwardRef<
  React.ElementRef<typeof RadixTabs.Trigger>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Trigger>
>(function TabsTrigger({ className, ...rest }, ref) {
  return (
    <RadixTabs.Trigger
      ref={ref}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center gap-2',
        'rounded-sm px-4 py-2 text-sm font-medium text-muted',
        'transition-colors duration-fast ease-standard',
        'outline-none focus-visible:outline focus-visible:outline-2',
        'focus-visible:outline-offset-2 focus-visible:outline-focus',
        'hover:text-text',
        'data-[state=active]:bg-elevated data-[state=active]:text-text data-[state=active]:shadow-1',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...rest}
    />
  );
});

export const TabsContent = forwardRef<
  React.ElementRef<typeof RadixTabs.Content>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Content>
>(function TabsContent({ className, ...rest }, ref) {
  return (
    <RadixTabs.Content
      ref={ref}
      className={cn(
        'mt-4 outline-none focus-visible:outline focus-visible:outline-2',
        'focus-visible:outline-offset-2 focus-visible:outline-focus',
        className,
      )}
      {...rest}
    />
  );
});
