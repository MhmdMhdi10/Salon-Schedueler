import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
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
 * Catches any failure from the decorative WebGL subtree (chunk load error,
 * scene/runtime error, GPU issues) and renders nothing — the gradient fallback
 * behind it stays visible. A purely decorative centerpiece must never take the
 * page down with it.
 */
class SceneBoundary extends Component<
  { children: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Decorative 3D centerpiece host. Renders a soft brand-gradient glow as the
 * fallback (loading / no-WebGL / reduced-motion / any scene error), and only
 * mounts the WebGL scene when the device supports it and the user has not
 * requested reduced motion. The whole subtree is `aria-hidden` (decorative).
 *
 * Rendering is **viewport-gated**: an `IntersectionObserver` watches the host,
 * and the scene's render loop is parked (`frameloop="never"`) whenever it is
 * scrolled off screen, so a continuously-rendering WebGL canvas never burns the
 * GPU/battery while the visitor reads the page below (ui-ux §12). A generous
 * `rootMargin` resumes the loop just before it re-enters, so the bloom is
 * already live by the time it's visible — no cold-start hitch.
 *
 * The scene is wrapped in a `SceneBoundary`, so even if the WebGL chunk fails
 * to load or the scene throws, the page keeps working and simply shows the
 * gradient.
 */
export function Salon3DStage({ className }: { className?: string }) {
  const [ready, setReady] = useState(false);
  // Default visible: the hero is above the fold, so the very first frame paints
  // immediately; the observer then corrects this as the page scrolls.
  const [inView, setInView] = useState(true);
  // Set if WebGL drops the context (non-throwing event) — then keep only the
  // gradient. Thrown errors are handled separately by SceneBoundary.
  const [lost, setLost] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReducedMotion && supportsWebGL()) {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      // Resume a little before the canvas scrolls back into view.
      { rootMargin: '200px 0px' },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [ready]);

  return (
    <div ref={hostRef} aria-hidden="true" className={cn('relative', className)}>
      {/* Fallback glow: a soft brand-gradient orb. Always present underneath, so
          there is a tasteful visual before/without WebGL (no empty hole). */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="h-3/4 w-3/4 rounded-pill bg-gradient-to-br from-primary via-accent to-secondary opacity-40 blur-3xl" />
      </div>
      {ready && !lost && (
        <SceneBoundary onError={() => setLost(true)}>
          <Suspense fallback={null}>
            <Salon3D active={inView} onContextLost={() => setLost(true)} />
          </Suspense>
        </SceneBoundary>
      )}
    </div>
  );
}

export default Salon3DStage;
