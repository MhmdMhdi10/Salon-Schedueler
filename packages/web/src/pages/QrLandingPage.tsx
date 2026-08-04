import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, ScanLine, Scissors, Store } from 'lucide-react';
import { salonApi } from '../api/client';
import { SeoHead } from '../components/seo';
import { Button, Card, ErrorState, Skeleton } from '../components/ui';
import { Motif } from '../components/brand';
import { writeSalonName } from '../utils/salonName';
import { usePwaInstall } from '../pwa/usePwaInstall';
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
 * and lands here with the payload in the URL. The redesign gives it the three
 * data states the steering standard requires:
 *
 *  - **resolving** — a layout-matched **skeleton of the salon header** (icon +
 *    name + reassurance lines), not a bare "loading" string, so there is no
 *    layout shift when the real identity arrives (ui-ux §6, §12);
 *  - **resolved** — the salon identity, a short reassurance line, and one
 *    prominent primary CTA «انتخاب خدمت» that begins the funnel;
 *  - **error** — two **distinct** states: a malformed payload
 *    («کد QR نامعتبر است») versus an unregistered salon («سالن یافت نشد»), each
 *    with a sensible next step (re-scan vs. go home).
 *
 * The `qr-landing` testID is preserved on the resolved view so existing tests
 * stay green. The QR resolution API call (`salonApi.resolveQr`) is unchanged.
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

  // One installed آرا app opens the device-local list of every scanned salon.
  const stylistName = staff?.fullName?.trim() ?? '';
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
  useSalonManifest('آرا — سالن‌های من', '/my-salons', 'آرا', themeColor);

  const { installed, promptInstall } = usePwaInstall();
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const handleInstall = async () => {
    const outcome = await promptInstall();
    // iOS Safari (and browsers that never fired the prompt) can't install
    // programmatically — reveal the manual Share → "Add to Home Screen" hint.
    if (outcome === 'unavailable') setShowInstallHelp(true);
  };

  // Resolving: a skeleton of the salon header (icon + name + reassurance),
  // mirroring the resolved layout so the CTA never jumps when data arrives.
  if (loading) {
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

  // Resolved: salon identity + reassurance + one prominent primary CTA, plus an
  // "add to home screen" affordance saved under the salon/stylist name.
  return (
    <div
      className="mx-auto flex w-full max-w-funnel flex-col items-center gap-5 py-6"
      data-testid="qr-landing"
    >
      <SeoHead title={t('seo.titles.qr')} />
      <Card as="section" className="flex w-full flex-col items-center gap-4 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-pill bg-primary/10 text-primary"
          aria-hidden="true"
        >
          {staff ? <Scissors className="h-6 w-6" /> : <Motif variant="mark" className="h-6 w-6" />}
        </div>
        <div>
          <p className="text-xs font-medium text-muted">
            {staff ? t('salon.qr.stylistWelcome') : t('salon.qr.welcome')}
          </p>
          <h1 className="mt-1 text-display text-xl text-text">{salon?.name}</h1>
          {stylistName && (
            <p className="mt-1 text-sm font-medium text-primary">
              {t('salon.qr.withStylist', { name: stylistName })}
            </p>
          )}
        </div>
        <p className="text-sm text-muted">
          {staff ? t('salon.qr.stylistReassurance') : t('salon.qr.reassurance')}
        </p>

        {/* Signature motif band — a token-driven brand divider. */}
        <Motif variant="band" className="h-5 w-full max-w-xs text-primary" />

        <Button size="lg" fullWidth onClick={() => navigate(bookPath)}>
          {t('booking.selectService')}
        </Button>

        {/* Save this salon/stylist to the phone for one-tap re-booking. Hidden
            once already installed; on iOS we reveal manual instructions. */}
        {installed ? (
          <p className="text-xs font-medium text-success">{t('salon.qr.install.installed')}</p>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={handleInstall}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-pill border border-border bg-surface px-4 text-sm font-medium text-text transition-colors duration-fast ease-standard hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {t('salon.qr.install.cta')}
            </button>
            <p className="max-w-[42ch] text-2xs text-muted">{t('salon.qr.install.body')}</p>
            {showInstallHelp && (
              <p role="note" className="max-w-[42ch] text-2xs text-muted">
                <span className="font-medium text-text">{t('salon.qr.install.manualTitle')}: </span>
                {t('salon.qr.install.manualBody')}
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
