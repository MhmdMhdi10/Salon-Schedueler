import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Check, Copy, Printer, QrCode } from 'lucide-react';
import { ApiError, qrApi, type SalonQrResponse } from '../../api/client';
import { SeoHead } from '../../components/seo';
import {
  Button,
  Card,
  CardContent,
  CardTitle,
  DirText,
  ErrorState,
  Skeleton,
} from '../../components/ui';
import { buildQrSvg } from './qr-svg';

/**
 * Owner-panel «QR و استند» surface (task 5.4; R4.1, R4.3; ui-ux §6 data states,
 * §10 meaningful alt + live regions, §11 RTL/bidi, §13 action-verb copy; seo §1
 * the owner area stays noindex).
 *
 * Replaces the section placeholder with the real surface:
 *
 *  1. **Stable QR image (R4.1):** fetches the salon's stable QR payload
 *     (`qrApi.getSalonQr`, derived server-side from `qrToken` via the shared
 *     `@salon/shared` codec) and renders it as a QR **image** generated
 *     client-side in the panel chunk (no QR dependency on the public bundle —
 *     see `./qr-svg`). The image carries a meaningful Persian `alt`.
 *  2. **Campaign URL:** the `/s/:slug?utm_source=qr` destination shown as
 *     selectable, copyable, bidi-isolated text (`<DirText>`), with a copy
 *     button that announces success via a live region.
 *  3. **Print-friendly standee (R4.3):** a `@media print` layout (see
 *     `owner-qr.css`) renders a large QR + salon name + a «برای رزرو اسکن کنید»
 *     invitation laid out for physical display; a print button calls
 *     `window.print()`.
 *  4. **Data states (§6):** skeleton while loading, error + retry, populated.
 *
 * The `owner-qr-page` testID and the surrounding `dir`/`lang` contract are
 * preserved.
 */

import './owner-qr.css';

/** Default salon scope (mirrors the other owner/admin sections). */
const DEFAULT_SALON_ID = '11111111-1111-1111-1111-111111111111';

type LoadStatus = 'loading' | 'success' | 'error';

/** Layout-matched skeleton shown while the QR data loads (§6/§12). */
function QrSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      data-testid="qr-loading"
      role="status"
      aria-busy="true"
      aria-label={t('owner.qr.loadingLabel')}
      className="flex flex-col gap-6"
    >
      <Skeleton variant="rect" className="h-64 w-64 self-center" />
      <Skeleton variant="rect" className="h-16" />
    </div>
  );
}

export function OwnerQrPage() {
  const { t } = useTranslation();
  const params = useParams<{ salonId?: string }>();
  const salonId = params.salonId ?? DEFAULT_SALON_ID;

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<SalonQrResponse | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError('');

    qrApi
      .getSalonQr(salonId)
      .then((res) => {
        if (!active) return;
        setData(res);
        setStatus('success');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : t('owner.qr.errorTitle'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [salonId, reloadToken, t]);

  // Build the QR image markup once per payload. Generation is pure/deterministic
  // and stays out of the public bundle (the panel chunk imports `./qr-svg`).
  const qrAlt = data ? t('owner.qr.imageAlt', { salon: data.salonName }) : '';
  const qrSvg = useMemo(
    () => (data ? buildQrSvg(data.payload, qrAlt) : ''),
    [data, qrAlt],
  );
  const qrDataUri = useMemo(
    () =>
      qrSvg
        ? `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`
        : '',
    [qrSvg],
  );

  const handleCopy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (permissions/insecure context); the URL is
      // still selectable as text, so a copy failure is non-fatal.
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <section data-testid="owner-qr-page" className="flex flex-col gap-6">
      <SeoHead title={t('owner.qr.title')} />

      <header className="flex flex-col gap-2 owner-qr-screen-only">
        <h1 className="text-xl font-bold text-text">{t('owner.qr.title')}</h1>
        <p className="max-w-[60ch] text-sm text-muted">{t('owner.qr.subtitle')}</p>
      </header>

      {status === 'loading' && <QrSkeleton />}

      {status === 'error' && (
        <ErrorState
          data-testid="qr-error"
          title={t('owner.qr.errorTitle')}
          description={error}
          retryLabel={t('owner.qr.retry')}
          onRetry={() => setReloadToken((n) => n + 1)}
        />
      )}

      {status === 'success' && data && (
        <>
          {/* ── Screen surface: QR preview + campaign URL + actions ── */}
          <Card
            as="section"
            data-testid="qr-card"
            className="flex flex-col items-center gap-4 owner-qr-screen-only"
          >
            <CardTitle as="h2" className="text-lg font-medium text-text">
              {t('owner.qr.previewTitle')}
            </CardTitle>
            <CardContent className="flex flex-col items-center gap-4">
              <img
                data-testid="qr-image"
                src={qrDataUri}
                alt={qrAlt}
                width={256}
                height={256}
                className="h-64 w-64 rounded-md border border-border bg-white p-3"
              />
              <p className="max-w-[40ch] text-center text-sm text-muted">
                {t('owner.qr.previewHint')}
              </p>
            </CardContent>
          </Card>

          {/* Campaign URL — selectable, copyable, bidi-isolated (§11). */}
          <Card
            as="section"
            data-testid="qr-url-card"
            className="flex flex-col gap-3 owner-qr-screen-only"
          >
            <CardTitle as="h2" className="text-lg font-medium text-text">
              {t('owner.qr.urlTitle')}
            </CardTitle>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted">{t('owner.qr.urlHint')}</p>
              <div className="flex flex-wrap items-center gap-3">
                <DirText
                  dir="ltr"
                  data-testid="qr-url"
                  className="min-w-0 flex-1 select-all break-all rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
                >
                  {data.url}
                </DirText>
                <Button
                  data-testid="qr-copy"
                  variant="secondary"
                  startIcon={
                    copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )
                  }
                  onClick={handleCopy}
                >
                  {copied ? t('owner.qr.copied') : t('owner.qr.copy')}
                </Button>
              </div>
              {/* Polite live region announces the copy result to assistive tech. */}
              <span
                data-testid="qr-copy-status"
                role="status"
                aria-live="polite"
                className="sr-only"
              >
                {copied ? t('owner.qr.copied') : ''}
              </span>
            </CardContent>
          </Card>

          {/* Print action (screen only). */}
          <div className="flex owner-qr-screen-only">
            <Button
              data-testid="qr-print"
              variant="primary"
              startIcon={<Printer className="h-4 w-4" />}
              onClick={handlePrint}
            >
              {t('owner.qr.printCta')}
            </Button>
          </div>

          {/* ── Print surface: the physical standee (@media print) ── */}
          <section
            data-testid="qr-standee"
            className="owner-qr-standee"
            aria-label={t('owner.qr.standeeLabel')}
          >
            <p className="owner-qr-standee__salon">{data.salonName}</p>
            <img
              data-testid="qr-standee-image"
              src={qrDataUri}
              alt={qrAlt}
              className="owner-qr-standee__qr"
            />
            <p className="owner-qr-standee__invite">{t('owner.qr.standeeInvite')}</p>
          </section>
        </>
      )}
    </section>
  );
}

export default OwnerQrPage;
