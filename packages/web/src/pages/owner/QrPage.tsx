import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Lock,
  Package,
  Printer,
  Sparkles,
} from 'lucide-react';
import {
  ApiError,
  cardOrderApi,
  qrApi,
  salonApi,
  type SalonQrResponse,
} from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { SeoHead } from '../../components/seo';
import { Motif } from '../../components/brand';
import {
  Button,
  Card,
  CardContent,
  CardTitle,
  cn,
  DirText,
  ErrorState,
  Select,
  Skeleton,
  TextField,
  Textarea,
  toPersianDigits,
} from '../../components/ui';
import {
  ACCENTS,
  accentVars,
  ASSET_KINDS,
  downloadQrPng,
  downloadQrSvg,
  qrImageDataUri,
  resolveAccent,
  type AccentTheme,
  type AssetKind,
} from './marketing-assets';
import { StylistQrGallery } from './StylistQrGallery';

import './owner-qr.css';

type LoadStatus = 'loading' | 'success' | 'error' | 'locked';
type OrderStatus = 'idle' | 'submitting' | 'success' | 'error';

/** A bookable stylist for the QR target selector. */
interface Stylist {
  id: string;
  fullName: string | null;
  role: string;
}

/** Minimal translator shape used by the asset renderer. */
type T = (key: string, options?: Record<string, unknown>) => string;

/** Normalize Persian/Arabic digits to Latin (for phone validation). */
function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/**
 * One custom-branded, print-ready asset (card / banner / standee). The brand
 * accent is injected as CSS variables on the root; layout + Persian typography
 * live in `owner-qr.css` (so it prints crisply with the app font).
 */
function QrAsset({
  kind,
  salonName,
  tagline,
  qrDataUri,
  qrAlt,
  accent,
  t,
  imgTestId,
}: {
  kind: AssetKind;
  salonName: string;
  tagline: string;
  qrDataUri: string;
  qrAlt: string;
  accent: AccentTheme;
  t: T;
  imgTestId?: string;
}) {
  const qr = (
    <span className="asset__qr-wrap">
      <span className="asset__qr-orbit" aria-hidden="true" />
      <span className="asset__qr-corner asset__qr-corner--a" aria-hidden="true" />
      <span className="asset__qr-corner asset__qr-corner--b" aria-hidden="true" />
      <span className="asset__qr-corner asset__qr-corner--c" aria-hidden="true" />
      <span className="asset__qr-corner asset__qr-corner--d" aria-hidden="true" />
      <span className="asset__qr">
        <img
          src={qrDataUri}
          alt={qrAlt}
          width={200}
          height={200}
          {...(imgTestId ? { 'data-testid': imgTestId } : {})}
        />
      </span>
      <span className="asset__qr-chip">
        <Sparkles aria-hidden="true" />
        {t('owner.qr.customBadge')}
      </span>
    </span>
  );
  const brand = (
    <span className="asset__brand">
      <Sparkles className="asset__brand-ic" aria-hidden="true" />
      {t('owner.qr.brand')}
    </span>
  );

  if (kind === 'banner') {
    return (
      <article
        className="asset asset--banner"
        style={accentVars(accent)}
        aria-label={t('owner.qr.assetAlt', { salon: salonName })}
      >
        <span className="asset__blob asset__blob--1" aria-hidden="true" />
        <span className="asset__blob asset__blob--2" aria-hidden="true" />
        <span className="asset__kicker">
          {t('owner.qr.salonPrefix')} {salonName}
        </span>
        <h3 className="asset__hero">{t('owner.qr.bannerHero')}</h3>
        {qr}
        <span className="asset__cta">{t('owner.qr.scanCta')}</span>
        <ol className="asset__steps">
          <li>
            <b>۱</b>
            {t('owner.qr.step1')}
          </li>
          <li>
            <b>۲</b>
            {t('owner.qr.step2')}
          </li>
          <li>
            <b>۳</b>
            {t('owner.qr.step3')}
          </li>
        </ol>
        {brand}
      </article>
    );
  }

  if (kind === 'standee') {
    return (
      <article
        className="asset asset--standee"
        style={accentVars(accent)}
        aria-label={t('owner.qr.assetAlt', { salon: salonName })}
      >
        <span className="asset__blob asset__blob--1" aria-hidden="true" />
        <span className="asset__salon">{salonName}</span>
        {tagline ? <span className="asset__tag">{tagline}</span> : null}
        {qr}
        <span className="asset__cta">{t('owner.qr.scanCta')}</span>
        {brand}
      </article>
    );
  }

  // Card (default).
  return (
    <article
      className="asset asset--card"
      style={accentVars(accent)}
      aria-label={t('owner.qr.assetAlt', { salon: salonName })}
    >
      <span className="asset__blob asset__blob--1" aria-hidden="true" />
      <span className="asset__blob asset__blob--2" aria-hidden="true" />
      {brand}
      <span className="asset__salon">{salonName}</span>
      {tagline ? <span className="asset__tag">{tagline}</span> : null}
      {qr}
      <span className="asset__cta">{t('owner.qr.scanCta')}</span>
      <span className="asset__foot">{t('owner.qr.cardFoot')}</span>
    </article>
  );
}

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
      <Skeleton variant="rect" className="h-72 w-72 self-center" />
      <Skeleton variant="rect" className="h-16" />
    </div>
  );
}

export function OwnerQrPage() {
  const { t } = useTranslation();
  const params = useParams<{ salonId?: string }>();
  const sessionSalonId = useSalonId();
  const salonId = params.salonId ?? sessionSalonId;

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<SalonQrResponse | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [copied, setCopied] = useState(false);

  // Studio state.
  const [kind, setKind] = useState<AssetKind>('card');
  const [accentKey, setAccentKey] = useState<string>('jade');
  const [tagline, setTagline] = useState('');

  // QR target: '' = the whole salon (default), or a specific stylist's id. A
  // stylist target swaps in that stylist's QR payload (best-effort) so the owner
  // can print a per-stylist code that opens that stylist's page pre-selected.
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [targetStaffId, setTargetStaffId] = useState('');
  const [staffPayload, setStaffPayload] = useState<string | null>(null);

  // Print-order state.
  const [orderQty, setOrderQty] = useState('100');
  const [orderName, setOrderName] = useState('');
  const [orderPhone, setOrderPhone] = useState('');
  const [orderAddress, setOrderAddress] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('idle');
  const [orderError, setOrderError] = useState('');
  const [orderId, setOrderId] = useState('');

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
        // Barcode generation is gated behind a paid subscription: the backend
        // answers 402 SUBSCRIPTION_REQUIRED for a salon on trial/expired. Show
        // the "subscribe to unlock" gate instead of a generic error.
        if (err instanceof ApiError && err.status === 402) {
          setStatus('locked');
          return;
        }
        setError(err instanceof ApiError ? err.message : t('owner.qr.errorTitle'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [salonId, reloadToken, t]);

  // Best-effort: load the salon's bookable stylists so the owner can target a
  // per-stylist QR. A failure just leaves the selector at "whole salon".
  useEffect(() => {
    let active = true;
    salonApi
      .getStylists(salonId)
      .then((res) => {
        if (active) setStylists(res.stylists);
      })
      .catch(() => {
        if (active) setStylists([]);
      });
    return () => {
      active = false;
    };
  }, [salonId]);

  // When a stylist is targeted, fetch their QR payload; reset to the salon QR
  // when "whole salon" is selected.
  useEffect(() => {
    if (!targetStaffId) {
      setStaffPayload(null);
      return;
    }
    let active = true;
    setStaffPayload(null);
    qrApi
      .getStaffQr(salonId, targetStaffId)
      .then((res) => {
        if (active) setStaffPayload(res.payload);
      })
      .catch(() => {
        if (active) setStaffPayload(null);
      });
    return () => {
      active = false;
    };
  }, [salonId, targetStaffId]);

  const accent = useMemo(() => resolveAccent(accentKey), [accentKey]);
  const targetStylist = useMemo(
    () => stylists.find((s) => s.id === targetStaffId) ?? null,
    [stylists, targetStaffId],
  );
  const stylistName = targetStylist?.fullName?.trim() ?? '';
  // The QR to render/print/download: the targeted stylist's payload when one is
  // selected and loaded, otherwise the salon-wide payload.
  const activePayload =
    targetStaffId && staffPayload ? staffPayload : data?.payload ?? '';
  const qrAlt = data
    ? stylistName
      ? t('owner.qr.imageAltStylist', { salon: data.salonName, stylist: stylistName })
      : t('owner.qr.imageAlt', { salon: data.salonName })
    : '';
  const qrDataUri = useMemo(
    () => (activePayload ? qrImageDataUri(activePayload, qrAlt) : ''),
    [activePayload, qrAlt],
  );
  const effectiveTagline =
    tagline.trim() ||
    (stylistName
      ? t('owner.qr.stylistTagline', { name: stylistName })
      : t('owner.qr.defaultTagline'));

  const handleCopy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable; the URL is still selectable as text.
    }
  };

  const handlePrint = () => window.print();

  // Orders apply to a printable card/banner; a standee selection prints but
  // orders the closest physical product (the card).
  const orderTemplate: 'card' | 'banner' = kind === 'banner' ? 'banner' : 'card';
  const normalizedPhone = toLatinDigits(orderPhone).replace(/\D/g, '');
  const orderValid =
    orderName.trim().length > 1 &&
    /^09\d{9}$/.test(normalizedPhone) &&
    orderAddress.trim().length > 4;

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    // No longer require `data` (the QR payload) — the order form is independent
    // of the subscription-gated QR generation. It only needs the salonId.
    const name = orderName.trim();
    const phone = toLatinDigits(orderPhone).replace(/\D/g, '');
    const address = orderAddress.trim();
    const fieldErrors: { name?: string; phone?: string; address?: string } = {};
    if (name.length < 2) fieldErrors.name = t('owner.qr.order.nameLabel');
    if (!/^09\d{9}$/.test(phone)) fieldErrors.phone = t('owner.qr.order.phoneLabel');
    if (address.length < 5) fieldErrors.address = t('owner.qr.order.addressLabel');
    if (Object.keys(fieldErrors).length > 0) {
      setOrderError(
        t('owner.qr.order.missingFields', {
          defaultValue: 'این فیلدها را تکمیل کنید: {{fields}}',
          fields: Object.values(fieldErrors).join('، '),
        }),
      );
      return;
    }
    setOrderStatus('submitting');
    setOrderError('');
    try {
      const res = await cardOrderApi.create({
        salonId,
        template: orderTemplate,
        accent: accentKey,
        quantity: Number(orderQty),
        contactName: name,
        phone,
        address,
        notes: orderNotes.trim() || undefined,
      });
      setOrderId(res.orderId);
      setOrderStatus('success');
    } catch (err) {
      setOrderError(
        err instanceof ApiError ? err.message : t('owner.qr.order.errorBody'),
      );
      setOrderStatus('error');
    }
  };

  const qtyOptions = ['50', '100', '250', '500', '1000'].map((v) => ({
    value: v,
    label: `${toPersianDigits(v)} ${t('owner.qr.order.unit')}`,
  }));

  return (
    <section
      data-testid="owner-qr-page"
      data-print-kind={kind}
      className="flex flex-col gap-6"
    >
      <SeoHead title={t('owner.qr.title')} />

      <header className="flex flex-col gap-2 owner-qr-screen-only">
        <h1 className="text-xl text-display text-text">{t('owner.qr.title')}</h1>
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

      {status === 'locked' && (
        <Card
          as="section"
          data-testid="qr-subscription-gate"
          elevated
          className="relative flex flex-col items-center gap-4 overflow-hidden text-center"
        >
          <Motif
            variant="watermark"
            className="pointer-events-none absolute -top-6 -end-6 h-40 w-40"
          />
          <span
            className="relative flex h-14 w-14 items-center justify-center rounded-pill bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <Lock className="h-7 w-7" />
          </span>
          <CardTitle as="h2" className="relative text-lg font-bold text-text">
            {t('owner.qr.gate.title')}
          </CardTitle>
          <p className="relative max-w-prose text-sm text-muted">
            {t('owner.qr.gate.body')}
          </p>
          <Link
            to="/owner/subscription"
            className="relative inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-md font-medium text-primary-contrast no-underline shadow-1 transition-colors duration-fast ease-standard hover:brightness-110 active:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {t('owner.qr.gate.cta')}
          </Link>
          <p className="relative max-w-prose text-xs text-muted">
            {t('owner.qr.gate.trialNote')}
          </p>
        </Card>
      )}

      {status === 'success' && data && (
        <>
          {/* ── Studio: pick a template, brand it, preview, print/download ── */}
          <Card
            as="section"
            data-testid="qr-studio"
            className="owner-qr-studio-card owner-qr-screen-only flex flex-col gap-5"
          >
            <div className="owner-qr-studio-head">
              <span className="owner-qr-studio-icon" aria-hidden="true">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <CardTitle as="h2" className="text-lg font-bold text-text">
                  {t('owner.qr.studioTitle')}
                </CardTitle>
                <p className="text-sm text-muted">{t('owner.qr.studioSubtitle')}</p>
              </div>
              <span className="owner-qr-live-badge">
                <span aria-hidden="true" />
                {t('owner.qr.livePreview')}
              </span>
            </div>

            <div className="owner-qr-studio-grid">
              {/* Controls column */}
              <div className="flex flex-col gap-4">
                {/* QR target: the whole salon (default) or a specific stylist. Only
                    shown when the salon has bookable stylists. */}
                {stylists.length > 0 && (
                  <Select
                    label={t('owner.qr.targetLabel')}
                    value={targetStaffId === '' ? 'salon' : targetStaffId}
                    onValueChange={(v) => setTargetStaffId(v === 'salon' ? '' : v)}
                    options={[
                      { value: 'salon', label: t('owner.qr.targetSalon') },
                      ...stylists.map((s) => ({
                        value: s.id,
                        label: s.fullName ?? t('owner.qr.targetStylistFallback'),
                      })),
                    ]}
                    helperText={t('owner.qr.targetHint')}
                  />
                )}

                {/* Template segmented control */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted">
                    {t('owner.qr.templateLabel')}
                  </span>
                  <div
                    className="owner-qr-segmented"
                    role="group"
                    aria-label={t('owner.qr.templateLabel')}
                  >
                    {ASSET_KINDS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={kind === k}
                        className={cn(
                          'owner-qr-seg',
                          kind === k && 'owner-qr-seg--on',
                        )}
                        onClick={() => setKind(k)}
                      >
                        {t(`owner.qr.template.${k}`)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent swatches */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted">
                    {t('owner.qr.accentLabel')}
                  </span>
                  <div
                    className="owner-qr-swatches"
                    role="group"
                    aria-label={t('owner.qr.accentLabel')}
                  >
                    {ACCENTS.map((a) => (
                      <button
                        key={a.key}
                        type="button"
                        aria-pressed={accentKey === a.key}
                        aria-label={t(`owner.qr.accent.${a.key}`)}
                        title={t(`owner.qr.accent.${a.key}`)}
                        className={cn(
                          'owner-qr-swatch',
                          accentKey === a.key && 'owner-qr-swatch--on',
                        )}
                        style={{
                          background: `linear-gradient(135deg, ${a.from}, ${a.to})`,
                        }}
                        onClick={() => setAccentKey(a.key)}
                      >
                        {accentKey === a.key && (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tagline */}
                <TextField
                  label={t('owner.qr.taglineLabel')}
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder={t('owner.qr.taglinePlaceholder')}
                  maxLength={48}
                  helperText={t('owner.qr.taglineHint')}
                />
              </div>

              {/* Live preview column — sticky on desktop so it stays in view
                  while scrolling the controls. */}
              <div className="flex flex-col gap-3">
                <div className="owner-qr-stage" data-testid="qr-asset-preview">
                  <QrAsset
                    kind={kind}
                    salonName={data.salonName}
                    tagline={effectiveTagline}
                    qrDataUri={qrDataUri}
                    qrAlt={qrAlt}
                    accent={accent}
                    t={t}
                  />
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-3">
                  <Button
                    data-testid="qr-print"
                    variant="primary"
                    startIcon={<Printer className="h-4 w-4" />}
                    onClick={handlePrint}
                  >
                    {t(`owner.qr.print.${kind}`)}
                  </Button>
                  <Button
                    variant="secondary"
                    startIcon={<Download className="h-4 w-4" />}
                    onClick={() => downloadQrSvg(activePayload, qrAlt, data.salonName)}
                  >
                    {t('owner.qr.downloadSvg')}
                  </Button>
                  <Button
                    variant="secondary"
                    startIcon={<ImageIcon className="h-4 w-4" />}
                    onClick={() =>
                      void downloadQrPng(activePayload, qrAlt, data.salonName)
                    }
                  >
                    {t('owner.qr.downloadPng')}
                  </Button>
                </div>
                <p className="text-xs text-muted">{t('owner.qr.printHint')}</p>
              </div>
            </div>
          </Card>

          {/* ── Per-stylist QR gallery (every bookable stylist at once) ── */}
          <StylistQrGallery salonId={salonId} salonName={data.salonName} />

          {/* ── Raw QR preview (stable code for digital reuse) ── */}
          <Card
            as="section"
            data-testid="qr-card"
            className="owner-qr-raw-card flex flex-col items-center gap-4 owner-qr-screen-only"
          >
            <CardTitle as="h2" className="text-lg font-medium text-text">
              {t('owner.qr.previewTitle')}
            </CardTitle>
            <CardContent className="flex flex-col items-center gap-4">
              <div className="owner-qr-raw-frame">
                <span aria-hidden="true">{t('owner.qr.brand')}</span>
                <img
                  data-testid="qr-image"
                  src={qrDataUri}
                  alt={qrAlt}
                  width={224}
                  height={224}
                  className="h-56 w-56 bg-white p-3"
                />
                <small>{t('owner.qr.customBadge')}</small>
              </div>
              <p className="max-w-[42ch] text-center text-sm text-muted">
                {t('owner.qr.previewHint')}
              </p>
            </CardContent>
          </Card>

          {/* ── Campaign URL — selectable, copyable, bidi-isolated ── */}
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
                <a
                  href={data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium text-text no-underline transition-colors duration-fast ease-standard hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  {t('owner.qr.open', { defaultValue: 'باز کردن' })}
                </a>
              </div>
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

          {/* ── Order printed cards ── */}
        </>
      )}

      {/* Order printed cards — always available (not subscription-gated). */}
      {status !== 'loading' && status !== 'error' && (
        <Card
          as="section"
          data-testid="qr-order-card"
          className="owner-qr-screen-only flex flex-col gap-4"
        >
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle as="h2" className="text-lg font-bold text-text">
              {t('owner.qr.order.title')}
            </CardTitle>
          </div>

          {orderStatus === 'success' ? (
            <div
              data-testid="qr-order-success"
              role="status"
              className="owner-qr-order__done"
            >
              <Check className="h-6 w-6" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <strong>{t('owner.qr.order.successTitle')}</strong>
                <span className="text-sm">
                  {t('owner.qr.order.successBody')}
                </span>
                {orderId && (
                  <span className="text-xs text-muted">
                    {t('owner.qr.order.refLabel')}:{' '}
                    <DirText dir="ltr" className="select-all">
                      {orderId}
                    </DirText>
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  setOrderStatus('idle');
                  setOrderId('');
                }}
              >
                {t('owner.qr.order.again')}
              </Button>
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleOrder}>
              <p className="text-sm text-muted">
                {t('owner.qr.order.subtitle', {
                  template: t(`owner.qr.template.${orderTemplate}`),
                })}
              </p>
              <div className="owner-qr-order__grid">
                <Select
                  label={t('owner.qr.order.qtyLabel')}
                  value={orderQty}
                  onValueChange={setOrderQty}
                  options={qtyOptions}
                />
                <TextField
                  label={t('owner.qr.order.nameLabel')}
                  value={orderName}
                  onChange={(e) => setOrderName(e.target.value)}
                  placeholder={t('owner.qr.order.namePlaceholder')}
                  autoComplete="name"
                  required
                />
                <TextField
                  label={t('owner.qr.order.phoneLabel')}
                  value={orderPhone}
                  onChange={(e) => setOrderPhone(e.target.value)}
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  autoComplete="tel"
                  placeholder="09xxxxxxxxx"
                  required
                />
              </div>
              <TextField
                label={t('owner.qr.order.addressLabel')}
                value={orderAddress}
                onChange={(e) => setOrderAddress(e.target.value)}
                placeholder={t('owner.qr.order.addressPlaceholder')}
                autoComplete="street-address"
                required
              />
              <Textarea
                label={t('owner.qr.order.notesLabel')}
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder={t('owner.qr.order.notesPlaceholder')}
                rows={2}
              />
              {orderStatus === 'error' && (
                <p role="alert" className="text-sm text-danger">
                  {orderError}
                </p>
              )}
              <div>
                <Button
                  type="submit"
                  data-testid="qr-order-submit"
                  variant="primary"
                  loading={orderStatus === 'submitting'}
                  startIcon={<Package className="h-4 w-4" />}
                >
                  {t('owner.qr.order.submit')}
                </Button>
              </div>
            </form>
          )}
        </Card>
          )}
      {status === 'success' && data && (
        <>
          {/* ── Print surface: simple standee (always in DOM; print-only) ── */}
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
              width={200}
              height={200}
              className="owner-qr-standee__qr"
            />
            <p className="owner-qr-standee__invite">
              {t('owner.qr.standeeInvite')}
            </p>
          </section>

          {/* ── Print surface: the branded card/banner (print-only) ── */}
          {kind !== 'standee' && (
            <div className="owner-qr-print-asset" aria-hidden="true">
              <QrAsset
                kind={kind}
                salonName={data.salonName}
                tagline={effectiveTagline}
                qrDataUri={qrDataUri}
                qrAlt={qrAlt}
                accent={accent}
                t={t}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
export default OwnerQrPage;
