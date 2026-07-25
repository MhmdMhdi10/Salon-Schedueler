import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, MapPin, Phone, Star } from 'lucide-react';
import i18n from '../i18n';
import { salonApi } from '../api/client';
import { JsonLd, SeoHead, SITE_URL } from '../components/seo';
import type { JsonLdNode } from '../components/seo';
import { DirText, JalaliDate, Num, formatRial, toPersianDigits } from '../components/ui';
import { TenantTheme } from '../components/theme';
import {
  getSalonProfile,
  IRANIAN_WEEK_ORDER,
  PERSIAN_DAY_LABEL,
  type SalonProfile,
  type SchemaDay,
} from '../data/salons';
import { getCity } from '../data/discovery';
import { writeSalonName } from '../utils/salonName';

const PROFILE_IMAGES = [
  '/images/blog/esthetician.jpg',
  '/images/features/section-1.webp',
  '/images/blog/salon-software.jpg',
  '/images/features/section-2.webp',
  '/images/blog/short-nails.jpg',
] as const;

function ProfileGallery({ salonName }: { salonName: string }) {
  const [active, setActive] = useState(0);
  const go = (delta: number) =>
    setActive((current) => (current + delta + PROFILE_IMAGES.length) % PROFILE_IMAGES.length);

  return (
    <section aria-labelledby="salon-gallery-title" className="relative">
      <h2 id="salon-gallery-title" className="sr-only">
        تصاویر {salonName}
      </h2>
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label={`گالری تصاویر ${salonName}`}
        tabIndex={0}
        onKeyDown={(event) => {
          const rtl = document.documentElement.dir === 'rtl';
          if (event.key === 'ArrowLeft') go(rtl ? 1 : -1);
          if (event.key === 'ArrowRight') go(rtl ? -1 : 1);
        }}
        className="h-[60vh] md:h-[50vh] relative grid max-h-80 min-h-64 grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-2xl lg:grid-cols-4"
      >
        {PROFILE_IMAGES.map((src, index) => (
          <div
            key={src}
            aria-roledescription="slide"
            aria-label={`تصویر ${toPersianDigits(index + 1)} از ${toPersianDigits(PROFILE_IMAGES.length)}`}
            aria-hidden={index === active ? 'false' : 'true'}
            className={
              index === 0
                ? 'relative col-span-2 row-span-2'
                : index > 2
                  ? 'relative hidden lg:block'
                  : 'relative'
            }
          >
            <img
              src={src}
              alt={`نمای ${toPersianDigits(index + 1)} از ${salonName}`}
              width={640}
              height={360}
              loading={index === 0 ? 'eager' : 'lazy'}
              {...(index === 0 ? { fetchpriority: 'high' } : {})}
              className="h-full w-full object-cover"
            />
          </div>
        ))}

        <button
          type="button"
          aria-label="تصویر قبلی"
          onClick={() => go(-1)}
          className="sr-only start-3"
        >
          تصویر قبلی
        </button>
        <button
          type="button"
          aria-label="تصویر بعدی"
          onClick={() => go(1)}
          className="sr-only end-3"
        >
          تصویر بعدی
        </button>
        <div role="tablist" aria-label="انتخاب تصویر" className="sr-only">
          {PROFILE_IMAGES.map((src, index) => (
            <button
              key={src}
              type="button"
              role="tab"
              aria-label={`نمایش تصویر ${toPersianDigits(index + 1)}`}
              aria-selected={index === active}
              onClick={() => setActive(index)}
            />
          ))}
        </div>
        <button
          type="button"
          className="absolute bottom-4 end-4 rounded-lg bg-elevated px-4 py-2 text-sm font-semibold text-text shadow-sm"
        >
          نمایش همه تصاویر
        </button>
      </div>
    </section>
  );
}

function Stars({ value = 0 }: { value?: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-warning"
      role="img"
      aria-label={`امتیاز ${value}`}
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          className="size-3.5"
          fill={index < Math.round(value) ? 'currentColor' : 'none'}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function tehranToday(): SchemaDay | null {
  try {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tehran',
      weekday: 'long',
    }).format(new Date());
    return (IRANIAN_WEEK_ORDER as readonly string[]).includes(weekday)
      ? (weekday as SchemaDay)
      : null;
  } catch {
    return null;
  }
}

function isOpenNow(salon: SalonProfile): boolean | null {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tehran',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const weekday = parts.find((part) => part.type === 'weekday')?.value;
    const hour = parts.find((part) => part.type === 'hour')?.value;
    const minute = parts.find((part) => part.type === 'minute')?.value;
    if (!weekday || !hour || !minute) return null;
    const hours = salon.openingHours.find((item) => item.day === weekday);
    if (!hours || hours.closed || !hours.opens || !hours.closes) return false;
    const now = `${hour}:${minute}`;
    return hours.opens <= now && now < hours.closes;
  } catch {
    return null;
  }
}

export function SalonProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const salon = getSalonProfile(slug);
  const [qrRedirecting, setQrRedirecting] = useState(false);

  useEffect(() => {
    if (salon || !slug) return;
    let active = true;
    setQrRedirecting(true);
    salonApi
      .resolveQr(slug)
      .then((result) => {
        if (active) navigate(`/salon/${result.salon.id}/book`, { replace: true });
      })
      .catch(() => {
        if (active) setQrRedirecting(false);
      });
    return () => {
      active = false;
    };
  }, [navigate, salon, slug]);

  if (!salon) {
    return (
      <div data-testid="salon-not-found" className="mx-auto min-h-[60vh] max-w-7xl px-4 py-12">
        <SeoHead title={t('salon.profile.notFoundTitle')} />
        <h1 className="text-2xl font-bold text-text">
          {t('salon.profile.notFoundTitle')}
        </h1>
        <p className="mt-2 text-muted">
          {qrRedirecting ? 'در حال بررسی پیوند سالن…' : t('salon.profile.notFoundBody')}
        </p>
        <Link to="/" className="mt-5 inline-flex text-primary underline">
          {t('salon.profile.backHome')}
        </Link>
      </div>
    );
  }

  const path = `/s/${salon.slug}`;
  const bookHref = `/salon/${salon.bookingSalonId}/book`;
  const cacheSalonName = () => writeSalonName(salon.bookingSalonId, salon.name);
  const reviews = salon.reviews ?? [];
  const staff = salon.staff ?? [];
  const today = tehranToday();
  const open = isOpenNow(salon);

  return (
    <TenantTheme accentKey={salon.brandAccent}>
      <div
        data-testid="salon-profile"
        className="mx-auto w-full max-w-container px-4 pb-28 pt-4 md:pb-12"
      >
        <SeoHead
          title={salon.name}
          description={salon.tagline}
          path={path}
          ogType="business.business"
          image={salon.ogImage ? `${SITE_URL}${salon.ogImage}` : undefined}
          index
        />
        <JsonLd data={buildSalonJsonLd(salon)} />

        <nav aria-label={t('salon.profile.breadcrumb')} className="sr-only">
          <ol role="list">
            <li>
              <Link to="/">{t('salon.profile.crumbHome')}</Link>
            </li>
            <li aria-hidden="true">‹</li>
            <li>{salon.name}</li>
          </ol>
        </nav>

        <header>
          <ProfileGallery salonName={salon.name} />
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-primary">
                پیشنهاد آرا
              </span>
              <span className="rounded-full bg-surface px-3 py-1 text-xs text-muted">
                {salon.category ?? 'سالن زیبایی'}
              </span>
            </div>
            <h1 className="text-xl font-bold leading-tight text-text">
              {salon.displayName ?? salon.name}
            </h1>
            <p className="mt-2 text-sm text-muted">{salon.address.streetAddress}</p>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <bdi className="font-bold text-text">
                <Num value={Number((salon.rating ?? 0).toFixed(1))} />
              </bdi>
              <Stars value={salon.rating} />
              <span className="text-muted">
                <Num value={salon.reviewCount ?? reviews.length} /> نظر
              </span>
            </div>

            <section className="mt-10" aria-labelledby="salon-services-title">
              <h2 id="salon-services-title" className="text-2xl font-bold text-text">
                خدمات
              </h2>
              <p className="mb-4 mt-4 font-semibold text-text">خدمات محبوب</p>
              <div className="overflow-hidden rounded-2xl border border-border bg-elevated">
                {salon.services.map((service) => (
                  <div
                    key={service.id}
                    className="flex min-h-16 items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-text">{service.name}</h3>
                      <p className="mt-1 text-xs text-muted">
                        {toPersianDigits(service.durationMinutes)} دقیقه
                      </p>
                    </div>
                    <bdi className="whitespace-nowrap text-sm font-semibold text-text">
                      {formatRial(service.priceRial)} ریال
                    </bdi>
                    <Link
                      to={`${bookHref}?service=${service.id}`}
                      onClick={cacheSalonName}
                      className="inline-flex min-h-[44px] items-center rounded-lg border border-primary px-4 text-sm font-semibold text-primary no-underline"
                    >
                      رزرو
                    </Link>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-10" aria-labelledby="salon-reviews-title">
              <h2 id="salon-reviews-title" className="text-2xl font-bold text-text">
                نظر مشتریان
              </h2>
              <div className="my-4 flex items-center gap-2">
                <span className="text-2xl font-bold text-text">
                  <Num value={Number((salon.rating ?? 0).toFixed(1))} />
                </span>
                <Stars value={salon.rating} />
                <span className="text-xs text-muted">
                  <Num value={salon.reviewCount ?? reviews.length} /> نظر
                </span>
              </div>
              <div className="space-y-4">
                {reviews.length > 0 ? (
                  reviews.map((review) => (
                    <article
                      key={review.id}
                      className="rounded-2xl border border-border bg-elevated p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-text">{review.author}</h3>
                          <Stars value={review.rating} />
                        </div>
                        <time className="text-xs text-muted" dateTime={review.date}>
                          <JalaliDate value={review.date} />
                        </time>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted">{review.body}</p>
                    </article>
                  ))
                ) : (
                  <p className="rounded-2xl border border-border bg-elevated p-4 text-sm text-muted">
                    هنوز نظری برای این سالن ثبت نشده است.
                  </p>
                )}
              </div>
            </section>

            <section className="mt-10" aria-labelledby="salon-about-title">
              <h2 id="salon-about-title" className="text-2xl font-bold text-text">
                درباره ما
              </h2>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-muted">
                {salon.description}
              </p>
            </section>

            <section className="mt-10" aria-labelledby="salon-amenities-title">
              <h2 id="salon-amenities-title" className="text-2xl font-bold text-text">
                امکانات
              </h2>
              <ul className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-3" role="list">
                {['اینترنت بی‌سیم', 'پرداخت با کارت', 'جای پارک', 'دسترسی آسان', 'مناسب کودکان'].map(
                  (amenity) => (
                    <li key={amenity} className="flex items-center gap-2">
                      <Check className="size-4 text-primary" aria-hidden="true" />
                      {amenity}
                    </li>
                  ),
                )}
              </ul>
            </section>

            {staff.length > 0 && (
              <section className="mt-10" aria-labelledby="salon-staff-title">
                <h2 id="salon-staff-title" className="text-2xl font-bold text-text">
                  تیم ما
                </h2>
                <ul className="mt-4 flex flex-wrap gap-5" role="list">
                  {staff.map((member) => (
                    <li key={member.id} className="text-center">
                      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-accent to-text text-xl font-bold text-bg">
                        {member.name.slice(0, 1)}
                      </span>
                      <span className="mt-2 block text-sm font-semibold text-text">
                        {member.name}
                      </span>
                      <span className="block text-xs text-muted">{member.role}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-10" aria-labelledby="salon-hours-title">
              <h2 id="salon-hours-title" className="text-2xl font-bold text-text">
                ساعت کاری
              </h2>
              <div className="mt-4 max-w-md overflow-hidden rounded-2xl border border-border bg-elevated">
                {IRANIAN_WEEK_ORDER.map((day) => {
                  const hours = salon.openingHours.find((item) => item.day === day);
                  return (
                    <div
                      key={day}
                      className={`flex items-center justify-between border-b border-border px-4 py-3 text-sm last:border-b-0 ${
                        day === today ? 'bg-accent/10 font-semibold' : ''
                      }`}
                    >
                      <span>{PERSIAN_DAY_LABEL[day]}</span>
                      <bdi className="text-muted">
                        {!hours || hours.closed
                          ? 'تعطیل'
                          : `${toPersianDigits(hours.opens ?? '')} – ${toPersianDigits(hours.closes ?? '')}`}
                      </bdi>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-10" aria-labelledby="salon-contact-title">
              <h2 id="salon-contact-title" className="text-2xl font-bold text-text">
                تماس و نشانی
              </h2>
              <address className="mt-4 space-y-2 not-italic text-sm text-muted">
                <p className="flex items-center gap-2">
                  <MapPin className="size-4" aria-hidden="true" />
                  {salon.address.streetAddress}، {salon.address.addressLocality}
                </p>
                <a
                  href={`tel:${salon.telephone}`}
                  className="flex items-center gap-2 font-semibold text-primary"
                >
                  <Phone className="size-4" aria-hidden="true" />
                  <DirText dir="ltr">{salon.telephone}</DirText>
                </a>
              </address>
              <div
                className="mt-5 flex h-64 items-center justify-center overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-accent/10 to-surface text-sm text-muted"
                aria-label={`نقشه ${salon.name}`}
              >
                نمایش موقعیت روی نقشه
              </div>
            </section>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-32 rounded-2xl border border-border bg-elevated p-6 shadow-sm">
              <p className="text-sm text-muted">هر زمان آماده‌اید</p>
              <h2 className="mt-2 text-lg font-semibold text-text">رزرو نوبت</h2>
              <Link
                to={bookHref}
                onClick={cacheSalonName}
                className="mt-5 flex min-h-[44px] items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-contrast no-underline"
              >
                رزرو کنید
              </Link>
              <div className="mt-5 flex items-center gap-2 text-sm">
                <bdi className="font-bold">{salon.rating?.toFixed(1)}</bdi>
                <Stars value={salon.rating} />
                <span className="text-muted">
                  <Num value={salon.reviewCount ?? reviews.length} />
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted">{salon.address.streetAddress}</p>
              {open !== null && (
                <p className={`mt-3 text-sm font-semibold ${open ? 'text-success' : 'text-danger'}`}>
                  {open ? 'اکنون باز است' : 'اکنون بسته است'}
                </p>
              )}
            </div>
          </aside>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-elevated px-4 py-3 md:hidden">
          <Link
            to={bookHref}
            onClick={cacheSalonName}
            className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-primary px-5 font-semibold text-primary-contrast no-underline"
          >
            رزرو نوبت
          </Link>
        </div>
      </div>
    </TenantTheme>
  );
}

export function buildSalonJsonLd(salon: SalonProfile): JsonLdNode[] {
  const url = `${SITE_URL}/s/${salon.slug}`;
  const salonType = salon.category === 'آرایشگاه مردانه' ? 'HairSalon' : 'BeautySalon';
  const node: JsonLdNode = {
    '@type': salonType,
    name: salon.name,
    url,
    telephone: salon.telephone,
    priceRange: salon.priceRange,
    address: {
      '@type': 'PostalAddress',
      streetAddress: salon.address.streetAddress,
      addressLocality: salon.address.addressLocality,
      addressRegion: salon.address.addressRegion,
      addressCountry: salon.address.addressCountry,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: salon.geo.latitude,
      longitude: salon.geo.longitude,
    },
    openingHoursSpecification: IRANIAN_WEEK_ORDER.map((day) =>
      salon.openingHours.find((hours) => hours.day === day),
    )
      .filter(
        (hours): hours is NonNullable<typeof hours> =>
          Boolean(hours && !hours.closed && hours.opens && hours.closes),
      )
      .map((hours) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: hours.day,
        opens: hours.opens,
        closes: hours.closes,
      })),
  };
  if (salon.ogImage) node.image = `${SITE_URL}${salon.ogImage}`;
  if (typeof salon.rating === 'number' && salon.reviewCount) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: salon.rating.toFixed(1),
      reviewCount: String(salon.reviewCount),
      bestRating: '5',
      worstRating: '1',
    };
  }
  if (salon.reviews?.length) {
    node.review = salon.reviews.map((review) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: review.author },
      datePublished: review.date.slice(0, 10),
      reviewRating: {
        '@type': 'Rating',
        ratingValue: String(review.rating),
        bestRating: '5',
        worstRating: '1',
      },
      reviewBody: review.body,
    }));
  }

  const services: JsonLdNode[] = salon.services.map((service) => ({
    '@type': 'Service',
    name: service.name,
    provider: { '@type': salonType, name: salon.name },
    offers: {
      '@type': 'Offer',
      price: String(service.priceRial),
      priceCurrency: 'IRR',
    },
  }));
  const city = getCity(salon.citySlug);
  const breadcrumb: JsonLdNode = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: i18n.t('salon.profile.crumbHome'),
        item: SITE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: city?.name ?? salon.address.addressLocality,
        item: `${SITE_URL}/city/${salon.citySlug}`,
      },
      { '@type': 'ListItem', position: 3, name: salon.name, item: url },
    ],
  };
  return [node, ...services, breadcrumb];
}

export default SalonProfilePage;
