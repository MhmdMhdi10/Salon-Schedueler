import { Suspense, lazy, useEffect, useState } from 'react';
import { cn } from '../ui/cn';

// three.js + R3F live in this lazily-loaded chunk, so they never ship in the
// public initial bundle — they download only once the scene is actually mounted
// (real browser, WebGL available, motion allowed).
const Salon3D = lazy(() => import('./Salon3D'));

/** Cheap runtime WebGL capability probe (returns false in jsdom/SSR). */
function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')),
    );
  } catch {
    return false;
  }
}

/**
 * Decorative 3D centerpiece host. Renders a soft brand-gradient glow as the
 * fallback (loading / no-WebGL / reduced-motion), and only mounts the WebGL
 * scene when the device supports it and the user has not requested reduced
 * motion. The whole subtree is `aria-hidden` (purely decorative).
 */
export function Salon3DStage({ className }: { className?: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReducedMotion && supportsWebGL()) {
      setReady(true);
    }
  }, []);

  return (
    <div aria-hidden="true" className={cn('relative', className)}>
      {/* Fallback glow: a soft brand-gradient orb. Always present underneath, so
          there is a tasteful visual before/without WebGL (no empty hole). */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="h-3/4 w-3/4 rounded-pill bg-gradient-to-br from-primary via-accent to-secondary opacity-40 blur-3xl" />
      </div>
      {ready && (
        <Suspense fallback={null}>
          <Salon3D />
        </Suspense>
      )}
    </div>
  );
}

export default Salon3DStage;
