import { type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from './cn';

/**
 * Route-transition wrapper. (The old CSS `Reveal` scroll-entrance duplicate of
 * `ScrollReveal` was removed — `ScrollReveal` is the single scroll-reveal
 * primitive; see `components/ui/ScrollReveal.tsx`.)
 */

export interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Route-transition wrapper: a soft, enter-only crossfade/slide keyed on the
 * current pathname, so each routed page arrives with a purposeful entrance.
 *
 * Deliberately **enter-only** (no exit phase): an exit-then-enter cycle would
 * add ~300ms of dead time to every navigation and interacts badly with
 * `Suspense` chunk loading. The restraint doctrine (Booksy directive §i) caps
 * chrome motion at short opacity-led moves — this is a `--dur-slow` token-eased
 * fade with a 12px inline slide.
 *
 * Implemented as a **CSS animation** rather than framer-motion: this component
 * sits in the app entry graph, so importing framer-motion here put ~44KB gzip
 * of animation runtime on the initial JS of every public route and pushed the
 * code-split budget (`scripts/analyze-bundle.mjs`). The `page-enter` keyframe in
 * `tailwind.config.js` reproduces the former `pageVariants` values exactly.
 *
 * `key={pathname}` remounts the element per navigation, which restarts the CSS
 * animation — the same trigger semantics the motion variant had.
 *
 * Under `prefers-reduced-motion: reduce` the `motion-safe:` variant drops the
 * animation entirely and the content simply appears (steering §9). The slide
 * direction follows writing direction via `--page-enter-shift`, flipped for LTR.
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  const { pathname } = useLocation();
  // The onboarding form owns fixed thumb-zone actions on mobile. A transformed
  // animation wrapper would become their containing block and make `fixed`
  // behave like absolute positioning inside the form instead of the viewport.
  const usesFixedActions = pathname === '/business/register';

  return (
    <div
      key={pathname}
      className={cn(
        !usesFixedActions && 'motion-safe:animate-page-enter ltr:[--page-enter-shift:12px]',
        className,
      )}
    >
      {children}
    </div>
  );
}
