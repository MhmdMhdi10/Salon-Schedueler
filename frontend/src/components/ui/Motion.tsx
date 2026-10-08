import type { ReactNode } from 'react';

export interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/** Compatibility wrapper for routed content; route changes render without animation. */
export function PageTransition({ children, className }: PageTransitionProps) {
  return <div className={className}>{children}</div>;
}
