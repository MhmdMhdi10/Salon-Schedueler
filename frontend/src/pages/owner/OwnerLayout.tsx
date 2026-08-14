import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { OwnerShell } from '../../components/layout';
import { RouteLoader } from '../../components/layout/RouteLoader';
import { SeoHead } from '../../components/seo';
import { TooltipProvider } from '../../components/ui/Tooltip';
import { useAuth } from '../../auth/AuthContext';
import { DEFAULT_SALON_ID } from '../../auth/useSalonId';
import {
  bootstrapAuth,
  getAccessToken,
  meApi,
  signOut as clearSession,
  type OwnerRole,
} from '../../api/client';

/** Auth/bootstrap lifecycle for the owner panel. */
type OwnerAuthState =
  | { phase: 'loading' }
  | { phase: 'authenticated'; role: OwnerRole; salonId: string; staffMemberId?: string }
  | { phase: 'unauthenticated' }
  | { phase: 'customer' }
  | { phase: 'platform-admin' };

/**
 * Owner panel layout + auth guard (task 5.1; R2.1, R2.2, R2.3).
 *
 * This is the single entry the `/owner/*` routes nest under. It owns three
 * responsibilities the spec calls out:
 *
 *  1. **Auth bootstrap (R2.2):** on load it restores the in-memory access token
 *     from the HttpOnly refresh cookie ({@link bootstrapAuth}) so a page
 *     refresh keeps the owner signed in. If no access token is already present
 *     and the refresh fails, the user is routed to the existing OTP login at
 *     `/auth`.
 *  2. **RBAC (R2.3):** it derives the authenticated principal's role from
 *     `GET /me` and hands it to {@link OwnerShell}, which filters the panel
 *     navigation by role (Owner/Admin get the full panel; Stylist gets the
 *     limited own-appointments view).
 *  3. **Sign-out:** clears the access token and server-side refresh cookie,
 *     then returns to `/auth`.
 *
 * The whole owner area is a private app surface and must never be indexed, so it
 * renders `<SeoHead>` with the `noindex` default (seo §1; R8.7) — the nested
 * pages do not opt into indexing.
 */
export function OwnerLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signOut: signOutSession } = useAuth();
  const [state, setState] = useState<OwnerAuthState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      // Reuse an access token already in memory (e.g. just-completed OTP login);
      // otherwise restore the session from the HttpOnly refresh cookie.
      const hasSession = getAccessToken() != null || (await bootstrapAuth());
      if (cancelled) return;
      if (!hasSession) {
        setState({ phase: 'unauthenticated' });
        return;
      }
      try {
        const { principal } = await meApi.getMe();
        if (cancelled) return;
        // A valid customer token is authenticated, but it is not an owner
        // session. Keep the customer signed in and return them to their own
        // surface instead of mounting an empty owner shell on a deep link.
        if (principal.role === 'PlatformAdmin') {
          setState({ phase: 'platform-admin' });
          return;
        }
        if (!principal.role) {
          setState({ phase: 'customer' });
          return;
        }
        setState({
          phase: 'authenticated',
          role: principal.role,
          salonId: principal.salonId ?? DEFAULT_SALON_ID,
          staffMemberId: principal.staffMemberId,
        });
      } catch {
        // A present-but-rejected token means the session is no longer valid.
        if (cancelled) return;
        clearSession();
        setState({ phase: 'unauthenticated' });
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = () => {
    // Clear the *app-wide* session through AuthContext (it drops the access
    // token and requests cookie deletion from the server, then
    // flips the shared auth state to anonymous). The shell header outside the
    // owner panel — `HeaderAuthNav`, which reads `useAuth()` — then immediately
    // shows the signed-out state. Calling the api `clearSession()` directly here
    // (the previous behaviour) only dropped the tokens, so the context stayed
    // "authenticated" and the header kept showing «خروج» / the account nav until
    // a full reload.
    signOutSession();
    navigate('/auth');
  };

  if (state.phase === 'loading') {
    return (
      <div dir="rtl" lang="fa" data-testid="owner-bootstrap">
        <SeoHead title={t('owner.title')} />
        <RouteLoader />
      </div>
    );
  }

  if (state.phase === 'unauthenticated') {
    return <Navigate to="/auth" replace />;
  }

  if (state.phase === 'customer') {
    return <Navigate to="/account" replace />;
  }

  if (state.phase === 'platform-admin') {
    return <Navigate to="/platform-admin" replace />;
  }

  return (
    <TooltipProvider>
      <OwnerShell role={state.role} salonId={state.salonId} onSignOut={handleSignOut}>
        <SeoHead title={t('owner.title')} />
        <Outlet
          context={{
            role: state.role,
            salonId: state.salonId,
            staffMemberId: state.staffMemberId,
            onSignOut: handleSignOut,
          }}
        />
      </OwnerShell>
    </TooltipProvider>
  );
}

export default OwnerLayout;
