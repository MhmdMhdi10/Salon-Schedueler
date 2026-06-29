import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Image as ImageIcon, QrCode, Share2 } from 'lucide-react';
import { ApiError, qrApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { SeoHead } from '../../components/seo';
import { Button, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { downloadQrPng, downloadQrSvg, qrImageDataUri } from './marketing-assets';

/**
 * Personal QR page — «بارکد من» (R4.1, R2.5).
 *
 * Unlike the owner-only QR studio, this surface is reachable by **every**
 * authenticated staff role (Owner/Admin/Stylist) and shows the signed-in
 * stylist their *own* stable booking QR so they can share or print it. The
 * salon scope mirrors the other owner pages.
 *
 * Data-surface states follow ui-ux §6: skeleton while the QR is generated,
 * a friendly error + retry, and the populated code with share/download
 * actions. A staff account that is not linked to a stylist record has no
 * personal QR, so it gets an explanatory empty state instead.
 */

/** Default salon scope (mirrors the other owner/admin sections). */
const DEFAULT_SALON_ID = '11111111-1111-1111-1111-111111111111';

type LoadStatus = 'loading' | 'success' | 'error';

/** The stylist-scoped QR payload + display names from `qrApi.getStaffQr`. */
interface StaffQr {
  payload: string;
  staffName: string;
  salonName: string;
}

/** Layout-matched skeleton shown while the personal QR loads (§6/§12). */
function MyQrSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      data-testid="my-qr-loading"
      role="status"
      aria-busy="true"
      aria-label={t('owner.myQr.loadingLabel')}
      className="flex flex-col items-center gap-6"
    >
      <Skeleton variant="rect" className="h-52 w-52" />
      <Skeleton variant="rect" className="h-12 w-full max-w-sm" />
    </div>
  );
}

export function MyQrPage() {
  const { t } = useTranslation();
  const { principal } = useAuth();
  const staffMemberId = principal?.staffMemberId;
  const salonId = DEFAULT_SALON_ID;

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<StaffQr | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // A staff account not linked to a stylist has no personal QR to fetch;
    // the empty state renders instead (no request is made).
    if (!staffMemberId) return;

    let active = true;
    setStatus('loading');
    setError('');

    qrApi
      .getStaffQr(salonId, staffMemberId)
      .then((res) => {
        if (!active) return;
        setData(res);
        setStatus('success');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : t('owner.myQr.errorBody'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [salonId, staffMemberId, reloadToken, t]);

  const staffName = data?.staffName ?? '';
  const alt = t('owner.myQr.imageAlt', { name: staffName });
  const qrDataUri = useMemo(
    () => (data ? qrImageDataUri(data.payload, alt) : ''),
    [data, alt],
  );

  /**
   * Share the personal booking link. Prefers the native share sheet when the
   * browser supports it; otherwise copies the link to the clipboard and shows
   * a transient «کپی شد».
   */
  const handleShare = async () => {
    if (!data) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: t('owner.myQr.shareTitle'), url: data.payload });
      } catch {
        // The user dismissed the share sheet (or it failed) — nothing to do.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(data.payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable; the QR/link is still on screen.
    }
  };

  return (
    <section data-testid="owner-my-qr-page" className="flex flex-col gap-6">
      <SeoHead title={t('owner.myQr.title')} />

      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-bold text-text">{t('owner.myQr.title')}</h1>
        <p className="max-w-[60ch] text-sm text-muted">{t('owner.myQr.subtitle')}</p>
      </header>

      {!staffMemberId ? (
        <EmptyState
          icon={<QrCode className="h-8 w-8" />}
          title={t('owner.myQr.unavailableTitle')}
          description={t('owner.myQr.unavailableBody')}
        />
      ) : (
        <>
          {status === 'loading' && <MyQrSkeleton />}

          {status === 'error' && (
            <ErrorState
              data-testid="my-qr-error"
              title={t('owner.myQr.errorTitle')}
              description={error}
              retryLabel={t('owner.myQr.retry')}
              onRetry={() => setReloadToken((n) => n + 1)}
            />
          )}

          {status === 'success' && data && (
            <div className="flex flex-col items-center gap-5">
              <img
                data-testid="my-qr-image"
                src={qrDataUri}
                alt={alt}
                width={208}
                height={208}
                className="h-52 w-52 rounded-md border border-border bg-white p-3"
              />

              <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-lg font-bold text-text">{staffName}</p>
                <p className="text-sm text-muted">{data.salonName}</p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  data-testid="my-qr-share"
                  variant="primary"
                  startIcon={<Share2 className="h-4 w-4" />}
                  onClick={() => void handleShare()}
                >
                  {t('owner.myQr.share')}
                </Button>
                <Button
                  variant="secondary"
                  startIcon={<Download className="h-4 w-4" />}
                  onClick={() => downloadQrSvg(data.payload, alt, staffName)}
                >
                  {t('owner.qr.downloadSvg')}
                </Button>
                <Button
                  variant="secondary"
                  startIcon={<ImageIcon className="h-4 w-4" />}
                  onClick={() => void downloadQrPng(data.payload, alt, staffName)}
                >
                  {t('owner.qr.downloadPng')}
                </Button>
              </div>

              <span
                data-testid="my-qr-copy-status"
                role="status"
                aria-live="polite"
                className="text-sm text-muted"
              >
                {copied ? t('owner.myQr.copied') : ''}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default MyQrPage;
