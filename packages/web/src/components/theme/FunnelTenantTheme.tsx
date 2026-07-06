import { useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { brandAccentApi } from '../../api/client';
import { TenantTheme } from './TenantTheme';
import { BookingFlowTransition } from '../ui/BookingFlowTransition';

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
 * **Step Transitions (Req 7.7):** wraps the routed content in
 * {@link BookingFlowTransition} — a Framer Motion `AnimatePresence` wrapper with
 * directional slide variants (`stepVariants`). Direction is positive when
 * advancing (step index increases) and negative when going back. RTL-aware: in
 * RTL, forward slides content from inline-end (left, negative x) and backward
 * from inline-start (right, positive x). Under `prefers-reduced-motion` only an
 * instant swap remains — no transform animation gates content.
 *
 * Transition timing: 250ms with standard decelerate easing `[0.2, 0, 0, 1]`,
 * matching the design spec for step-to-step slides (Req 3.1, 3.5, 3.7, 7.7).
 */
export function FunnelTenantTheme() {
  const { salonId } = useParams<{ salonId: string }>();
  const [accentKey, setAccentKey] = useState<string | null>(null);

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
      <BookingFlowTransition>
        <Outlet />
      </BookingFlowTransition>
    </TenantTheme>
  );
}

export default FunnelTenantTheme;
