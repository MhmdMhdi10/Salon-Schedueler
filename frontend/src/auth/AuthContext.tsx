import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  authApi,
  bootstrapAuth,
  getAccessToken,
  meApi,
  setAccessToken,
  signOut as clearSession,
  type StaffContext,
  type PrincipalRole,
} from '../api/client';

/**
 * The authenticated identity as the app sees it. Mirrors the backend
 * `Principal`, but `role` is optional: a plain customer token carries no role
 * (they are not subject to the staff RBAC matrix), while a staff token carries
 * the staff `role`, `staffMemberId`, and the same customer subject id used by
 * customer self-service routes.
 */
export interface AuthPrincipal {
  id: string;
  role?: PrincipalRole;
  staffMemberId?: string;
  /** The salon a staff principal belongs to (used to scope the owner panel). */
  salonId?: string;
  platformAdminId?: string;
}

/** Lifecycle of the app-wide session. */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  principal: AuthPrincipal | null;
  /** Staff role when the principal is a staff member, else undefined. */
  role: PrincipalRole | undefined;
  /** True when the session can use customer self-service. */
  isCustomer: boolean;
  /** True when the session is an authenticated staff member (has a role). */
  isStaff: boolean;
  /** True only for the global platform operator surface. */
  isPlatformAdmin: boolean;
  /** Active salon memberships for this phone. */
  staffContexts: StaffContext[];
  /** Select a salon membership and refresh the scoped session. */
  selectStaffContext: (staffMemberId: string) => Promise<AuthPrincipal | null>;
  /**
   * Re-derive the session from the current access token or HttpOnly refresh
   * cookie (call after a fresh OTP login). Resolves to the principal, or null
   * when anonymous.
   */
  refresh: () => Promise<AuthPrincipal | null>;
  /** Clear the session (tokens + state). Navigation is left to the caller. */
  signOut: () => void;
}

/**
 * Default value used when a component reads the context without an
 * `AuthProvider` above it (e.g. isolated component tests). It reports an
 * anonymous, no-op session rather than throwing, so shells render their
 * signed-out state safely outside the provider.
 */
const DEFAULT_VALUE: AuthContextValue = {
  status: 'anonymous',
  principal: null,
  role: undefined,
  isCustomer: false,
  isStaff: false,
  isPlatformAdmin: false,
  staffContexts: [],
  selectStaffContext: async () => null,
  refresh: async () => null,
  signOut: () => {},
};

const AuthContext = createContext<AuthContextValue>(DEFAULT_VALUE);

/**
 * App-wide authentication provider (R2.2). On mount it restores the in-memory
 * access token from the HttpOnly refresh cookie and derives the principal from
 * `GET /me`, so every surface — not just the owner panel — knows who is signed
 * in and with which role. Staff sessions remain customer-capable because the
 * backend issues their token from the matching customer subject as well. This
 * is what lets the header render role-aware navigation (customer pages for
 * customers; the management panel for staff).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [principal, setPrincipal] = useState<AuthPrincipal | null>(null);
  const [staffContexts, setStaffContexts] = useState<StaffContext[]>([]);

  const refresh = useCallback(async (): Promise<AuthPrincipal | null> => {
    // Reuse an access token already in memory (just-completed OTP login),
    // otherwise restore the session from the HttpOnly refresh cookie.
    const hasSession = getAccessToken() != null || (await bootstrapAuth());
    if (!hasSession) {
      setPrincipal(null);
      setStaffContexts([]);
      setStatus('anonymous');
      return null;
    }
    try {
      const { principal: p } = await meApi.getMe();
      const next: AuthPrincipal = {
        id: p.id,
        role: p.role,
        staffMemberId: p.staffMemberId,
        salonId: p.salonId,
        platformAdminId: p.platformAdminId,
      };
      setPrincipal(next);
      // Older test doubles and older API deployments do not expose contexts;
      // the optional lookup must never make an otherwise valid login fail.
      try {
        const result = await authApi.getContexts();
        setStaffContexts(result.staffContexts ?? []);
      } catch {
        setStaffContexts([]);
      }
      setStatus('authenticated');
      return next;
    } catch {
      // A present-but-rejected token means the session is no longer valid.
      clearSession();
      setPrincipal(null);
      setStaffContexts([]);
      setStatus('anonymous');
      return null;
    }
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setPrincipal(null);
    setStaffContexts([]);
    setStatus('anonymous');
  }, []);

  const selectStaffContext = useCallback(
    async (staffMemberId: string): Promise<AuthPrincipal | null> => {
      const result = await authApi.selectContext(staffMemberId);
      setAccessToken(result.accessToken);
      return refresh();
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(() => {
    const role = principal?.role;
    const isPlatformAdmin = status === 'authenticated' && role === 'PlatformAdmin';
    return {
      status,
      principal,
      role,
      isStaff:
        status === 'authenticated' && (role === 'Owner' || role === 'Admin' || role === 'Stylist'),
      // Platform admins use the same phone/customer subject when they switch
      // into the customer panel, so their customer self-service APIs are valid
      // too. Staff sessions already share this customer capability.
      isCustomer: status === 'authenticated',
      isPlatformAdmin,
      staffContexts,
      selectStaffContext,
      refresh,
      signOut,
    };
  }, [status, principal, staffContexts, selectStaffContext, refresh, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Read the app-wide auth state. Safe to call without a provider (anonymous). */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
