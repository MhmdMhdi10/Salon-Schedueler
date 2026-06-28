import { useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { brandAccentApi } from '../../api/client';
import { TenantTheme } from './TenantTheme';

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
      <Outlet />
    </TenantTheme>
  );
}

export default FunnelTenantTheme;
