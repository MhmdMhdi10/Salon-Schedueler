import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { brandAccentApi } from '../../api/client';
import { TenantTheme } from './TenantTheme';
import { stepVariants } from '../../lib/motion-variants';

/** Standard easing matching `--ease-standard` */
const STEP_TRANSITION = {
  type: 'tween' as const,
  duration: 0.3,
  ease: [0.2, 0, 0, 1] as [number, number, number, number],
};

/**
 * Derives the step index (0-based) from the current pathname. The booking funnel
 * root (`/salon/:salonId/book`) is step 0; appending `/confirm` is step 1.
 */
function stepIndexFromPath(pathname: string): number {
  if (pathname.endsWith('/confirm')) return 1;
  return 0;
}

/**
 * Storefront booking-funnel theming boundary (signature-ui-system R4.2/R4.7/R4.8).
 *
 * A layout route around the salon booking funnel (`/salon/:salonId/book` and its
 * confirm step). It resolves the salon's Brand_Accent by id — so even an
 * anonymous visitor who deep-links into the funnel gets the storefront's accent
 * — and scopes it to the funnel subtree via {@link TenantTheme}. Non-storefront
 * routes stay on the global signature theme (they are not wrapped).
 *
 * Resolution is best-effort and total: until it resolves (and on any failure)
 * the accent is the signature default (no overrides), so the funnel always
 * renders — it simply tints once the accent arrives. The funnel pages render in
 * the `<Outlet />`.
 *
 * **Step Transitions (Req 7.7):** wraps the routed content in Framer Motion
 * `AnimatePresence` with directional slide variants (`stepVariants`). Direction
 * is positive when advancing (step index increases) and negative when going back.
 * RTL-aware: in RTL, forward slides content from inline-end (left, negative x)
 * and backward from inline-start (right, positive x) — handled by `stepVariants`.
 * Under `prefers-reduced-motion` only opacity crossfade remains.
 */
export function FunnelTenantTheme() {
  const { salonId } = useParams<{ salonId: string }>();
  const { pathname } = useLocation();
  const prefersReduced = useReducedMotion();
  const [accentKey, setAccentKey] = useState<string | null>(null);

  // Track the direction of step navigation: 1 = forward, -1 = backward.
  const currentStepIndex = stepIndexFromPath(pathname);
  const prevStepIndexRef = useRef(currentStepIndex);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    const prev = prevStepIndexRef.current;
    if (currentStepIndex !== prev) {
      setDirection(currentStepIndex > prev ? 1 : -1);
      prevStepIndexRef.current = currentStepIndex;
    }
  }, [currentStepIndex]);

  useEffect(() => {
    if (!salonId) return undefined;
    let active = true;
    brandAccentApi
      .get(salonId)
      .then((res) => {
        if (active) setAccentKey(res.brandAccent);
      })
      .catch(() => {
        // Signature default on failure — never block the revenue path.
        if (active) setAccentKey(null);
      });
    return () => {
      active = false;
    };
  }, [salonId]);

  return (
    <TenantTheme accentKey={accentKey}>
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentStepIndex}
          custom={direction}
          variants={prefersReduced ? {} : stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={STEP_TRANSITION}
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
    </TenantTheme>
  );
}

export default FunnelTenantTheme;
