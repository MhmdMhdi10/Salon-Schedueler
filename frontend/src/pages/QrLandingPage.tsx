import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ScanLine, Store } from 'lucide-react';
import { salonApi } from '../api/client';
import { SeoHead } from '../components/seo';
import { Card, ErrorState, Skeleton } from '../components/ui';
import { writeSalonName } from '../utils/salonName';
import { useSalonManifest } from '../pwa/salonManifest';
import { ensureAaFill } from '../styles/contrast';
import { ACCENTS, resolveAccent } from '../components/theme/accents';
import { saveSalon } from '../utils/savedSalons';

/** Resolved salon identity returned by the QR resolver. */
type ResolvedSalon = { id: string; name: string; brandAccent?: string | null };

/** Resolved stylist (present only when a stylist-scoped QR was scanned). */
type ResolvedStaff = { id: string; fullName: string | null };

/**
 * The two distinct failure modes for a scanned QR payload (ui-ux QR-landing
 * recipe, R4.3). They are kept apart so each can offer the right next step:
 *  - `malformed` — the payload is missing/garbled (unreadable code);
 *  - `unregistered` — the payload resolved to no active salon.
 */
type QrErrorKind = 'malformed' | 'unregistered';

/**
 * QR-resolved salon landing page (R4.3, R2.3; ui-ux QR-landing recipe, §6).
 *
 * This is the cold entry to the booking funnel: a customer scans a physical QR
 * and lands here with the payload in the URL. It resolves the salon identity,
 * saves the scan locally, then opens service selection directly. The route keeps
 * the data states that matter at this boundary:
 *
 *  - **resolving** — a layout-matched **skeleton of the salon header** (icon +
 *    name + reassurance lines), not a bare "loading" string, so there is no
 *    layout shift when the real identity arrives (ui-ux §6, §12);
 *  - **resolved** — immediately replaced with the booking funnel's service
 *    selector; there is no intermediate welcome screen;
 *  - **error** — two **distinct** states: a malformed payload
 *    («کد QR نامعتبر است») versus an unregistered salon («سالن یافت نشد»), each
 *    with a sensible next step (re-scan vs. go home).
 *
 * The QR resolution API call (`salonApi.resolveQr`) is unchanged.
 *
 * The QR payload is per-visit and not a stable URL, so this route must never be
 * indexed; `<SeoHead>` (noindex default) emits `noindex,follow` in every state
 * — loading, error, and resolved (seo §1, R8.7).
 */
export function QrLandingPage() {
  const { t } = useTranslation();
  const { payload } = useParams<{ payload: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const routed = (
    location.state as { resolvedQr?: { salon: ResolvedSalon; staff?: ResolvedStaff } } | null
  )?.resolvedQr;
  const [salon, setSalon] = useState<ResolvedSalon | null>(routed?.salon ?? null);
  const [staff, setStaff] = useState<ResolvedStaff | null>(routed?.staff ?? null);
  const [errorKind, setErrorKind] = useState<QrErrorKind | null>(null);
  const [loading, setLoading] = useState(!routed);
  const scanRecorded = useRef(false);
  const redirectStarted = useRef(false);

  useEffect(() => {
    if (!salon || scanRecorded.current || typeof salonApi.recordScan !== 'function') return;
    const state = location.state as { scanSource?: unknown } | null;
    const query = new URLSearchParams(location.search);
    const rawSource = state?.scanSource ?? query.get('utm_source') ?? query.get('source');
    const source = typeof rawSource === 'string' ? rawSource.trim() : '';
    if (!source) return;
    scanRecorded.current = true;
    void salonApi.recordScan(salon.id, source).catch(() => undefined);
  }, [location.search, location.state, salon]);

  useEffect(() => {
    let active = true;

    if (routed) {
      writeSalonName(routed.salon.id, routed.salon.name);
      return;
    }

    if (!payload) {
      setErrorKind('malformed');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorKind(null);
    salonApi
      .resolveQr(payload)
      .then((result) => {
        if (!active) return;
        setSalon(result.salon);
        setStaff(result.staff ?? null);
        // Cache the resolved name so later funnel steps (e.g. the success
        // receipt's "where" line) can show it without a new API call.
        writeSalonName(result.salon.id, result.salon.name);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        // Distinguish a garbled payload from a payload that simply resolved to
        // no salon, so each error state can offer the right next step.
        setErrorKind(err?.code === 'QR_MALFORMED' ? 'malformed' : 'unregistered');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [payload, routed]);

  useEffect(() => {
    if (!salon) return;
    saveSalon({
      id: salon.id,
      name: salon.name,
      staffId: staff?.id,
      staffName: staff?.fullName?.trim() || undefined,
    });
  }, [salon, staff]);

  const bookPath = salon
    ? `/salon/${salon.id}/book${staff ? `?staff=${encodeURIComponent(staff.id)}` : ''}`
    : '';
  // R4.6: derive the PWA chrome color from the salon's Brand_Accent (the same
  // AA-safe fill the storefront theme uses); undefined → signature default.
  const accentKey = salon?.brandAccent ?? null;
  const themeColor =
    accentKey && ACCENTS.some((a) => a.key === accentKey)
      ? ensureAaFill(resolveAccent(accentKey).from)
      : undefined;
  // Keep the per-salon manifest behavior for QR entries, even though the
  // visible route now moves straight into service selection.
  useSalonManifest('آرا — سالن‌های من', '/account', 'آرا', themeColor);

  // A QR scan is only an entry point. Replace it with the real booking funnel
  // so customers land on service selection without an intermediate welcome
  // screen or an extra browser-history step.
  useEffect(() => {
    if (!salon || loading || redirectStarted.current) return;
    redirectStarted.current = true;
    navigate(bookPath, { replace: true });
  }, [bookPath, loading, navigate, salon]);

  // Resolving/redirecting: the QR route stays transient; a resolved scan is
  // replaced by the service-selection funnel as soon as its identity is known.
  if (loading || salon) {
    return (
      <div className="mx-auto flex w-full max-w-funnel flex-col items-center gap-5 py-6">
        <SeoHead title={t('seo.titles.qr')} />
        <Card
          as="section"
          className="flex w-full flex-col items-center gap-4 text-center"
          aria-busy="true"
        >
          <div role="status" aria-label={t('salon.qr.loadingLabel')} className="contents">
            <Skeleton variant="circle" className="h-12 w-12" />
            <Skeleton variant="text" className="h-6 w-2/3" />
            <Skeleton variant="text" className="w-full" />
            <Skeleton variant="text" className="w-4/5" />
            <Skeleton variant="rect" className="h-12 w-full" />
          </div>
        </Card>
      </div>
    );
  }

  // Error: two visually-distinct states with their own copy + next step.
  if (errorKind) {
    const isMalformed = errorKind === 'malformed';
    return (
      <div className="mx-auto flex w-full max-w-funnel flex-col items-center gap-5 py-6">
        <SeoHead title={t('seo.titles.qr')} />
        <Card as="section" className="w-full" data-testid={`qr-error-${errorKind}`}>
          <ErrorState
            icon={isMalformed ? <ScanLine className="h-8 w-8" /> : <Store className="h-8 w-8" />}
            title={isMalformed ? t('salon.qr.malformedTitle') : t('salon.qr.notFoundTitle')}
            description={isMalformed ? t('salon.qr.malformedBody') : t('salon.qr.notFoundBody')}
            headingLevel="h1"
          />
          <div className="mt-2 flex justify-center">
            <Link
              to="/"
              className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-text hover:bg-elevated"
            >
              {t('salon.qr.backHome')}
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return null;
}
