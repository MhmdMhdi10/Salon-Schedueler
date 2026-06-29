import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Image as ImageIcon, Users } from 'lucide-react';
import { qrApi, salonApi } from '../../api/client';
import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  Skeleton,
} from '../../components/ui';
import { downloadQrPng, downloadQrSvg, qrImageDataUri } from './marketing-assets';

/** Data-surface state for the per-stylist QR gallery (ui-ux §6). */
type GalleryStatus = 'loading' | 'error' | 'empty' | 'success';

/** One stylist tile: the resolved name + their QR payload (null = QR failed). */
interface GalleryItem {
  id: string;
  name: string;
  payload: string | null;
}

/**
 * Per-stylist QR gallery for the owner panel «QR و استند» page.
 *
 * Shows every bookable stylist side by side, each with their own stable QR code
 * (the same per-stylist payload behind `qrApi.getStaffQr`) and SVG/PNG download
 * actions — so an owner can print one code per stylist in a single pass. The
 * single-target studio dropdown still lives in `QrPage`; this is the all-at-once
 * companion.
 *
 * It runs the full data-surface state set (loading skeleton / empty / error +
 * retry / populated) and degrades per-tile: a stylist whose QR fetch fails shows
 * a placeholder with disabled downloads rather than failing the whole gallery.
 */
export function StylistQrGallery({
  salonId,
  salonName,
}: {
  salonId: string;
  salonName: string;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<GalleryStatus>('loading');
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    salonApi
      .getStylists(salonId)
      .then(async (res) => {
        const stylists = res.stylists;
        if (stylists.length === 0) {
          if (!cancelled) {
            setItems([]);
            setStatus('empty');
          }
          return;
        }
        // Fetch every stylist's QR in parallel; a single rejection must not sink
        // the whole gallery, so settle them all and degrade per-tile.
        const results = await Promise.allSettled(
          stylists.map((s) => qrApi.getStaffQr(salonId, s.id)),
        );
        if (cancelled) return;
        const next: GalleryItem[] = stylists.map((s, i) => {
          const result = results[i];
          return {
            id: s.id,
            name: s.fullName?.trim() || t('owner.qr.targetStylistFallback'),
            payload: result.status === 'fulfilled' ? result.value.payload : null,
          };
        });
        setItems(next);
        setStatus('success');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [salonId, reloadToken, t]);

  return (
    <Card
      as="section"
      data-testid="qr-stylist-gallery"
      className="owner-qr-screen-only flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1">
        <CardTitle as="h2" className="text-lg font-bold text-text">
          {t('owner.qr.gallery.title')}
        </CardTitle>
        <p className="text-sm text-muted">{t('owner.qr.gallery.subtitle')}</p>
      </div>

      {status === 'loading' && (
        <div
          data-testid="qr-stylist-gallery-loading"
          role="status"
          aria-busy="true"
          aria-label={t('owner.qr.gallery.loadingLabel')}
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rect" className="h-48" />
          ))}
        </div>
      )}

      {status === 'error' && (
        <ErrorState
          title={t('owner.qr.gallery.errorTitle')}
          description={t('owner.qr.gallery.errorBody')}
          retryLabel={t('owner.qr.gallery.retry')}
          onRetry={() => setReloadToken((n) => n + 1)}
        />
      )}

      {status === 'empty' && (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title={t('owner.qr.gallery.emptyTitle')}
          description={t('owner.qr.gallery.emptyBody')}
        />
      )}

      {status === 'success' && (
        <ul
          aria-label={t('owner.qr.gallery.listLabel')}
          className="grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 lg:grid-cols-4"
        >
          {items.map((item) => {
            const alt = t('owner.qr.imageAltStylist', {
              salon: salonName,
              stylist: item.name,
            });
            return (
              <li
                key={item.id}
                className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface p-3"
              >
                {item.payload ? (
                  <img
                    data-testid="qr-stylist-image"
                    src={qrImageDataUri(item.payload, alt)}
                    alt={alt}
                    width={160}
                    height={160}
                    className="h-40 w-40 rounded-md border border-border bg-white p-2"
                  />
                ) : (
                  <div className="flex h-40 w-40 items-center justify-center rounded-md border border-border bg-surface p-2 text-center text-xs text-muted">
                    {t('owner.qr.gallery.qrUnavailable')}
                  </div>
                )}
                <span
                  data-testid="qr-stylist-name"
                  className="text-center text-sm font-medium text-text"
                >
                  {item.name}
                </span>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="secondary"
                    startIcon={<Download className="h-4 w-4" />}
                    disabled={!item.payload}
                    onClick={() =>
                      item.payload &&
                      downloadQrSvg(item.payload, alt, `${salonName} ${item.name}`)
                    }
                  >
                    {t('owner.qr.downloadSvg')}
                  </Button>
                  <Button
                    variant="secondary"
                    startIcon={<ImageIcon className="h-4 w-4" />}
                    disabled={!item.payload}
                    onClick={() =>
                      item.payload &&
                      void downloadQrPng(
                        item.payload,
                        alt,
                        `${salonName} ${item.name}`,
                      )
                    }
                  >
                    {t('owner.qr.downloadPng')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export default StylistQrGallery;
