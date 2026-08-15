import {
  ArrowDownLeft,
  ArrowUpLeft,
  BellRing,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ContactRound,
  Link2,
  ListChecks,
  MessageCircle,
  Phone,
  Search,
  Scissors,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { motion, useInView, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { JsonLd, SeoHead, SITE_NAME, SITE_URL } from '../components/seo';
import { ThemeToggle, useTheme } from '../components/theme';
import { PublicFooter } from '../components/layout/AppShell';
import { AraCalendarHero } from './AraCalendarHero';
import './AraScrollLanding.css';

const SCROLL_LANDING_DESCRIPTION =
  'آرا نوبت‌های حضوری و آنلاین سالن را در تقویم شمسی جمع می‌کند؛ لینک و QR رزرو کمک می‌کند مشتری بدون تماس تلفنی وقت بگیرد.';

type ScrollFeatureId = 'calendar' | 'booking' | 'services' | 'clients';

interface ScrollFeature {
  id: ScrollFeatureId;
  number: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  cta: string;
  accent: string;
}

const SCROLL_FEATURES: ScrollFeature[] = [
  {
    id: 'calendar',
    number: '۰۱',
    eyebrow: 'تقویم شمسی، برای روز واقعی سالن',
    title: 'به‌جای حدس‌زدن، کل روزت را یک‌جا ببین.',
    description:
      'نوبت‌های حضوری و آنلاین را کنار هم ببین؛ بدان چه کسی، برای چه خدمتی و چه ساعتی می‌آید. جای خالی و تداخل را زودتر می‌بینی و روزت را بهتر می‌چینی.',
    bullets: [
      'نمای روز، هفته و ماه',
      'نوبت‌های حضوری و آنلاین در یک تقویم',
      'نمایش هم‌زمان روی گوشی و دسکتاپ',
    ],
    cta: 'تقویم سالنم را راه می‌اندازم',
    accent: 'teal',
  },
  {
    id: 'booking',
    number: '۰۲',
    eyebrow: 'لینک رزرو سالن',
    title: 'مشتری لازم نیست برای هر نوبت تماس بگیرد.',
    description:
      'یک لینک رزرو و QR اختصاصی داشته باش. آن را روی کارت، استند سالن، واتساپ یا اینستاگرام بگذار؛ مشتری خدمت و زمان آزاد را می‌بیند و نوبت مستقیم وارد تقویمت می‌شود.',
    bullets: [
      'رزرو بدون نصب اپ و تماس تلفنی',
      'لینک و QR برای کارت، سالن و پیام‌رسان‌ها',
      'کمتر پاسخ‌گویی برای قیمت و زمان خالی',
    ],
    cta: 'لینک رزروم را می‌سازم',
    accent: 'violet',
  },
  {
    id: 'services',
    number: '۰۳',
    eyebrow: 'خدمات و قیمت‌ها',
    title: 'قبل از تماس، مشتری می‌داند چه می‌گیرد.',
    description:
      'خدمت، مدت و قیمت را شفاف نشان بده تا مشتری قبل از رزرو انتخابش را بداند. سؤال‌های تکراری کمتر می‌شود و انتخاب سریع‌تر.',
    bullets: [
      'ساخت منوی خدمات در چند دقیقه',
      'زمان و قیمت جدا برای هر خدمت',
      'انتخاب آرایشگر برای هر خدمت',
    ],
    cta: 'منوی خدماتم را آماده می‌کنم',
    accent: 'blue',
  },
  {
    id: 'clients',
    number: '۰۴',
    eyebrow: 'مشتری‌ها و بازگشت',
    title: 'مشتری را برای نوبت بعدی از یاد نبر.',
    description:
      'سابقهٔ خدمات و یادداشت‌های مشتری را منظم نگه دار تا پیگیری و یادآوری ساده‌تر شود؛ رابطه‌ای که فقط به یک نوبت ختم نمی‌شود.',
    bullets: [
      'پروفایل و سابقهٔ هر مشتری',
      'یادآوری نوبت و پیگیری ساده',
      'شناخت بهتر مشتری‌های پرتکرار',
    ],
    cta: 'مشتری‌هایم را منظم می‌کنم',
    accent: 'rose',
  },
];

const FEATURE_LIFESTYLE_IMAGES: Record<ScrollFeatureId, { src: string; alt: string }> = {
  calendar: {
    src: '/images/hero/feature-calendar-barber.png',
    alt: 'آرایشگر جوان در حال مدیریت برنامهٔ روزانهٔ سالن',
  },
  booking: {
    src: '/images/hero/feature-booking-hairstylist.png',
    alt: 'استایلیست جوان در حال هماهنگ کردن زمان رزرو با مشتری',
  },
  services: {
    src: '/images/hero/feature-services-barber.png',
    alt: 'آرایشگر جوان در حال معرفی خدمات سالن',
  },
  clients: {
    src: '/images/hero/feature-clients-hairstylist.png',
    alt: 'مدیر سالن در حال بررسی سابقهٔ مشتری',
  },
};

function AraScrollBrandRail() {
  return (
    <header className="ara-scroll-brand-rail" aria-label="دسترسی‌های آرا">
      <Link to="/" className="ara-scroll-brand-logo" aria-label="صفحهٔ اصلی آرا">
        <img
          className="ara-scroll-brand-logo-light"
          src="/brand/ara-logo.png"
          alt="آرا"
          width={955}
          height={480}
          loading="eager"
          decoding="async"
        />
        <img
          className="ara-scroll-brand-logo-dark"
          src="/brand/ara-logo-dark.png"
          alt=""
          width={955}
          height={480}
          loading="eager"
          decoding="async"
        />
      </Link>
      <div className="ara-scroll-brand-actions">
        <Link to="/business/register" className="ara-scroll-header-start">
          شروع رایگان <ArrowUpLeft aria-hidden="true" />
        </Link>
        <Link to="/auth" className="ara-scroll-login">
          ورود
        </Link>
        <ThemeToggle className="ara-scroll-theme-toggle" />
      </div>
    </header>
  );
}

function ScrollFeatureIcon({ id }: { id: ScrollFeatureId }) {
  if (id === 'calendar') return <CalendarDays aria-hidden="true" />;
  if (id === 'booking') return <Link2 aria-hidden="true" />;
  if (id === 'services') return <Scissors aria-hidden="true" />;
  return <UsersRound aria-hidden="true" />;
}

function FeatureLifestylePhoto({ id }: { id: ScrollFeatureId }) {
  const image = FEATURE_LIFESTYLE_IMAGES[id];

  return (
    <div className={`ara-scroll-feature-lifestyle-photo is-${id}`} aria-hidden="true">
      <span className="ara-scroll-feature-lifestyle-photo-backdrop" />
      <img src={image.src} alt={image.alt} loading="lazy" decoding="async" />
    </div>
  );
}

function AraInstagramProfileCard() {
  return (
    <div className="ara-scroll-real-instagram-profile is-hero is-minimal" aria-hidden="true">
      <div className="ara-scroll-real-instagram-badge">
        <i className="ara-scroll-real-instagram-glyph" aria-hidden="true" />
      </div>
      <div className="ara-scroll-real-instagram-mini-identity">
        <span className="ara-scroll-real-instagram-avatar">
          <img src="/images/hero/instagram-profile-barber-v2.png" alt="" />
        </span>
        <div className="ara-scroll-real-instagram-stats">
          <span>
            <strong>۱۲۸</strong>
            <small>پست</small>
          </span>
          <span>
            <strong>۸٫۴K</strong>
            <small>دنبال‌کننده</small>
          </span>
          <span>
            <strong>۳۱۲</strong>
            <small>دنبال‌شونده</small>
          </span>
        </div>
      </div>
      <div className="ara-scroll-real-instagram-mini-booking-link">
        <Link2 aria-hidden="true" />
        <span>
          <small>لینک رزرو سالن در بیو</small>
          <strong>ara.ir/sam-hair</strong>
        </span>
      </div>
    </div>
  );
}

function AraScrollHeroObject() {
  return (
    <div className="ara-scroll-hero-object is-compact">
      <AraCalendarHero compact showPhone={false} />
      <AraInstagramProfileCard />
    </div>
  );
}

type AraOwnerPreviewSection = 'calendar' | 'services' | 'clients';

function AraOwnerPreviewSidebar({ active }: { active: AraOwnerPreviewSection }) {
  const items = [
    { key: 'calendar', icon: CalendarDays },
    { key: 'services', icon: Scissors },
    { key: 'clients', icon: ContactRound },
    { key: 'notifications', icon: BellRing },
  ] as const;

  return (
    <aside className="ara-scroll-owner-preview-sidebar" aria-hidden="true">
      <strong>آرا</strong>
      {items.map(({ key, icon: Icon }) => (
        <span className={key === active ? 'is-active' : ''} key={key}>
          <Icon />
        </span>
      ))}
      <span className="is-bottom">
        <Sparkles />
      </span>
    </aside>
  );
}

const ARA_PREVIEW_WEEK = [
  {
    day: 'شنبه',
    date: '۳',
    count: '۳ نوبت',
    appointments: [
      { name: 'کوتاهی و براشینگ', customer: 'مریم احمدی · ۰۹:۰۰', tone: 'teal' },
      { name: 'رنگ و مش', customer: 'سارا محمدی · ۱۶:۳۰', tone: 'violet' },
    ],
  },
  {
    day: 'یکشنبه',
    date: '۴',
    count: '۲ نوبت',
    appointments: [{ name: 'فیشال پوست', customer: 'نگار رضایی · ۱۳:۳۰', tone: 'rose' }],
  },
  {
    day: 'دوشنبه',
    date: '۵',
    count: '۱ نوبت',
    appointments: [{ name: 'کوتاهی', customer: 'الهام کریمی · ۱۰:۰۰', tone: 'teal' }],
  },
  {
    day: 'سه‌شنبه',
    date: '۶',
    count: '۲ نوبت',
    appointments: [{ name: 'رنگ مو', customer: 'سارا محمدی · ۱۶:۰۰', tone: 'violet' }],
  },
  { day: 'چهارشنبه', date: '۷', count: 'بدون نوبت', appointments: [] },
  {
    day: 'پنج‌شنبه',
    date: '۸',
    count: '۱ نوبت',
    appointments: [{ name: 'اصلاح صورت', customer: 'مریم احمدی · ۱۲:۰۰', tone: 'rose' }],
  },
  { day: 'جمعه', date: '۹', count: 'تعطیل', appointments: [] },
] as const;

function CalendarFeatureObject() {
  return (
    <div
      className="ara-scroll-object-shell ara-scroll-real-object ara-scroll-real-calendar"
      aria-hidden="true"
    >
      <div className="ara-scroll-real-depth" />
      <div className="ara-scroll-real-calendar-monitor">
        <div className="ara-scroll-real-calendar-workspace">
          <AraOwnerPreviewSidebar active="calendar" />
          <div className="ara-scroll-real-calendar-body">
            <div className="ara-scroll-real-calendar-body-head">
              <div>
                <strong>تقویم</strong>
                <small>مدیریت نوبت‌ها و برنامه‌ریزی روزانه</small>
              </div>
              <span>ثبت نوبت حضوری</span>
            </div>
            <div className="ara-scroll-real-calendar-toolbar">
              <div className="ara-scroll-real-calendar-mini-tabs">
                <span>روز</span>
                <span className="is-active">هفته</span>
                <span>ماه</span>
                <span>فهرست</span>
              </div>
              <div className="ara-scroll-real-calendar-date-nav">
                <ChevronRight aria-hidden="true" />
                <strong>مرداد ۱۴۰۵</strong>
                <ChevronLeft aria-hidden="true" />
                <span>امروز</span>
              </div>
            </div>
            <div className="ara-scroll-real-calendar-filters">
              <span>
                <Search aria-hidden="true" /> جست‌وجوی نوبت
              </span>
              <span>
                همه آرایشگرها <ChevronLeft aria-hidden="true" />
              </span>
              <span>
                همه وضعیت‌ها <ChevronLeft aria-hidden="true" />
              </span>
            </div>
            <div className="ara-scroll-real-calendar-week" role="presentation">
              {ARA_PREVIEW_WEEK.map((day, index) => (
                <div
                  className={`ara-scroll-real-calendar-day ${index === 0 ? 'is-today' : ''}`}
                  key={day.day}
                >
                  <header>
                    <span>{day.day}</span>
                    <strong>{day.date}</strong>
                    <small>{day.count}</small>
                  </header>
                  <div className="ara-scroll-real-calendar-day-items">
                    {day.appointments.map((appointment) => (
                      <div
                        className={`ara-scroll-real-calendar-day-appointment is-${appointment.tone}`}
                        key={appointment.customer}
                      >
                        <strong>{appointment.name}</strong>
                        <small>{appointment.customer}</small>
                      </div>
                    ))}
                    {day.appointments.length === 0 && (
                      <em>{day.count === 'تعطیل' ? 'تعطیل' : 'خالی'}</em>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="ara-scroll-real-calendar-appointment ara-scroll-real-calendar-appointment-main">
        <div className="ara-scroll-real-appointment-head">
          <span className="ara-scroll-real-service-icon is-teal">
            <Scissors aria-hidden="true" />
          </span>
          <span>
            <strong>کوتاهی و براشینگ</strong>
            <small>نوبت تأیید شده</small>
          </span>
          <Check aria-hidden="true" />
        </div>
        <div className="ara-scroll-real-appointment-meta">
          <span>
            <UserRound aria-hidden="true" /> مریم احمدی
          </span>
          <span>
            <Clock3 aria-hidden="true" /> ۰۹:۰۰ – ۱۰:۰۰
          </span>
        </div>
      </div>
      <div className="ara-scroll-real-calendar-appointment ara-scroll-real-calendar-appointment-secondary">
        <div className="ara-scroll-real-appointment-head">
          <span className="ara-scroll-real-service-icon is-violet">
            <Sparkles aria-hidden="true" />
          </span>
          <span>
            <strong>رنگ و مش</strong>
            <small>سارا محمدی</small>
          </span>
          <span className="ara-scroll-real-time-badge">۱۶:۳۰</span>
        </div>
      </div>
      <div className="ara-scroll-real-calendar-note">
        <CalendarPlus aria-hidden="true" />
        <span>
          <small>یک نوبت خالی</small>
          <strong>۱۹:۰۰</strong>
        </span>
      </div>
      <FeatureLifestylePhoto id="calendar" />
    </div>
  );
}

function BookingFeatureObject() {
  return (
    <div
      className="ara-scroll-object-shell ara-scroll-real-object ara-scroll-real-booking"
      aria-hidden="true"
    >
      <div className="ara-scroll-real-booking-phone">
        <div className="ara-scroll-real-phone-camera" />
        <div className="ara-scroll-real-booking-screen">
          <div className="ara-scroll-real-booking-ui">
            <div className="ara-scroll-real-booking-topline">
              <span className="ara-scroll-real-booking-wordmark">آرا</span>
              <span>رزرو نوبت</span>
              <i />
            </div>
            <div className="ara-scroll-real-booking-salon">
              <span className="ara-scroll-real-booking-salon-avatar">م</span>
              <span>
                <strong>سالن مریم</strong>
                <small>تهران · سعادت‌آباد</small>
              </span>
              <ChevronLeft aria-hidden="true" />
            </div>
            <div className="ara-scroll-real-booking-progress">
              <span className="is-current">۱</span>
              <i />
              <span>۲</span>
              <i />
              <span>۳</span>
            </div>
            <div className="ara-scroll-real-booking-heading">
              <small>مرحله اول از سه</small>
              <strong>رزرو نوبت</strong>
            </div>
            <div className="ara-scroll-real-booking-section-title">
              <Scissors aria-hidden="true" />
              <strong>انتخاب خدمت</strong>
            </div>
            <div className="ara-scroll-real-booking-service-card is-active">
              <span>
                <strong>کوتاهی و براشینگ</strong>
                <small>
                  <Clock3 aria-hidden="true" /> ۶۰ دقیقه
                </small>
              </span>
              <b>۴۵۰٬۰۰۰ ریال</b>
              <Check aria-hidden="true" />
            </div>
            <div className="ara-scroll-real-booking-service-card">
              <span>
                <strong>رنگ و مش</strong>
                <small>
                  <Clock3 aria-hidden="true" /> ۹۰ دقیقه
                </small>
              </span>
              <b>۸۵۰٬۰۰۰ ریال</b>
            </div>
            <div className="ara-scroll-real-booking-section-title is-muted">
              <CalendarDays aria-hidden="true" />
              <strong>انتخاب تاریخ و زمان</strong>
            </div>
            <div className="ara-scroll-real-booking-date-row">
              <span className="is-active">
                <small>شنبه</small>
                <strong>۳ مرداد</strong>
              </span>
              <span>
                <small>یکشنبه</small>
                <strong>۴ مرداد</strong>
              </span>
              <span>
                <small>دوشنبه</small>
                <strong>۵ مرداد</strong>
              </span>
            </div>
            <div className="ara-scroll-real-booking-time-list">
              <span>۱۰:۰۰</span>
              <span className="is-active">۱۴:۳۰</span>
              <span>۱۶:۰۰</span>
            </div>
            <div className="ara-scroll-real-booking-submit">
              ادامه رزرو <ArrowDownLeft aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
      <div className="ara-scroll-real-booking-card ara-scroll-real-booking-service">
        <span className="ara-scroll-real-booking-card-label">
          <Scissors aria-hidden="true" /> خدمت انتخاب شد
        </span>
        <strong>کوتاهی و براشینگ</strong>
        <span>۶۰ دقیقه · ۴۵۰٬۰۰۰ ریال</span>
        <Check aria-hidden="true" />
      </div>
      <div className="ara-scroll-real-booking-confirmed">
        <Check aria-hidden="true" />
        <span>
          <small>نوبت آمادهٔ تأیید</small>
          <strong>شنبه · ساعت ۱۴:۳۰</strong>
        </span>
      </div>
      <div className="ara-scroll-real-booking-link">
        <Link2 aria-hidden="true" />
        <span>ara.ir/sam-hair</span>
      </div>
      <FeatureLifestylePhoto id="booking" />
    </div>
  );
}

function ServicesFeatureObject() {
  return (
    <div
      className="ara-scroll-object-shell ara-scroll-real-object ara-scroll-real-services"
      aria-hidden="true"
    >
      <div className="ara-scroll-real-depth" />
      <div className="ara-scroll-real-services-panel">
        <div className="ara-scroll-real-settings-layout">
          <AraOwnerPreviewSidebar active="services" />
          <div className="ara-scroll-real-settings-body">
            <div className="ara-scroll-real-panel-header">
              <div>
                <span className="ara-scroll-real-panel-kicker">تنظیمات سالن</span>
                <strong>خدمات</strong>
                <small>مدیریت منوی خدمات و قیمت‌ها</small>
              </div>
              <span className="ara-scroll-real-panel-icon is-blue">
                <Scissors aria-hidden="true" />
              </span>
            </div>
            <div className="ara-scroll-real-services-info">
              <span className="ara-scroll-real-panel-icon is-teal">
                <UsersRound aria-hidden="true" />
              </span>
              <span>
                <strong>هر خدمت را به آرایشگرهایش وصل کن</strong>
                <small>هنگام رزرو فقط افراد مرتبط نمایش داده می‌شوند.</small>
              </span>
            </div>
            <div className="ara-scroll-real-service-list">
              <div className="ara-scroll-real-service-row is-active">
                <span className="ara-scroll-real-service-symbol is-teal">
                  <Scissors aria-hidden="true" />
                </span>
                <span className="ara-scroll-real-service-content">
                  <strong>کوتاهی و براشینگ</strong>
                  <small>
                    <Clock3 aria-hidden="true" /> ۶۰ دقیقه <b>۴۵۰٬۰۰۰ ریال</b>
                  </small>
                  <em>
                    <UsersRound aria-hidden="true" /> ۲ آرایشگر متصل
                  </em>
                </span>
                <span className="ara-scroll-real-service-action">انتخاب آرایشگر</span>
              </div>
              <div className="ara-scroll-real-service-row">
                <span className="ara-scroll-real-service-symbol is-violet">
                  <Sparkles aria-hidden="true" />
                </span>
                <span className="ara-scroll-real-service-content">
                  <strong>فیشال پوست</strong>
                  <small>
                    <Clock3 aria-hidden="true" /> ۷۵ دقیقه <b>۶۵۰٬۰۰۰ ریال</b>
                  </small>
                  <em>
                    <UsersRound aria-hidden="true" /> ۱ آرایشگر متصل
                  </em>
                </span>
                <span className="ara-scroll-real-service-action">انتخاب آرایشگر</span>
              </div>
              <div className="ara-scroll-real-service-row">
                <span className="ara-scroll-real-service-symbol is-rose">
                  <Sparkles aria-hidden="true" />
                </span>
                <span className="ara-scroll-real-service-content">
                  <strong>رنگ و مش</strong>
                  <small>
                    <Clock3 aria-hidden="true" /> ۹۰ دقیقه <b>۸۵۰٬۰۰۰ ریال</b>
                  </small>
                  <em>
                    <UsersRound aria-hidden="true" /> ۲ آرایشگر متصل
                  </em>
                </span>
                <span className="ara-scroll-real-service-action">انتخاب آرایشگر</span>
              </div>
            </div>
            <div className="ara-scroll-real-services-add-row">
              <span>خدمت جدید</span>
              <b>+ افزودن خدمت</b>
            </div>
          </div>
        </div>
      </div>
      <div className="ara-scroll-real-services-float ara-scroll-real-services-float-one">
        <span className="ara-scroll-real-service-symbol is-teal">
          <Scissors aria-hidden="true" />
        </span>
        <span>
          <strong>کوتاهی و براشینگ</strong>
          <small>۶۰ دقیقه · ۴۵۰٬۰۰۰ ریال</small>
        </span>
        <Check aria-hidden="true" />
      </div>
      <div className="ara-scroll-real-services-float ara-scroll-real-services-float-two">
        <UsersRound aria-hidden="true" />
        <span>۲ آرایشگر متصل</span>
      </div>
      <div className="ara-scroll-real-services-add">
        <span>+</span>
        <span>افزودن خدمت جدید</span>
      </div>
      <FeatureLifestylePhoto id="services" />
    </div>
  );
}

function ClientsFeatureObject() {
  return (
    <div
      className="ara-scroll-object-shell ara-scroll-real-object ara-scroll-real-clients"
      aria-hidden="true"
    >
      <div className="ara-scroll-real-depth" />
      <div className="ara-scroll-real-clients-panel">
        <div className="ara-scroll-real-settings-layout">
          <AraOwnerPreviewSidebar active="clients" />
          <div className="ara-scroll-real-settings-body">
            <div className="ara-scroll-real-panel-header">
              <div>
                <span className="ara-scroll-real-panel-kicker">دفترچه سالن</span>
                <strong>مشتری‌ها</strong>
                <small>مشتری‌ها، سابقه مراجعه و شماره تماس</small>
              </div>
              <span className="ara-scroll-real-panel-icon is-teal">
                <ContactRound aria-hidden="true" />
              </span>
            </div>
            <div className="ara-scroll-real-client-toolbar">
              <div className="ara-scroll-real-client-search">
                <Search aria-hidden="true" />
                <span>جست‌وجوی مشتری</span>
              </div>
              <span className="ara-scroll-real-client-count">۳ مشتری</span>
            </div>
            <div className="ara-scroll-real-client-list">
              <div className="ara-scroll-real-client-row is-active">
                <span className="ara-scroll-real-client-avatar is-teal">س</span>
                <span className="ara-scroll-real-client-info">
                  <strong>سارا محمدی</strong>
                  <small>
                    <Phone aria-hidden="true" /> ۰۹۱۲۳۴۵۶۷۸۹
                  </small>
                </span>
                <span className="ara-scroll-real-client-stats">
                  <b>۴ مراجعه</b>
                  <small>آخرین: ۳ مرداد</small>
                </span>
                <CalendarPlus aria-hidden="true" />
              </div>
              <div className="ara-scroll-real-client-row">
                <span className="ara-scroll-real-client-avatar is-violet">م</span>
                <span className="ara-scroll-real-client-info">
                  <strong>مریم احمدی</strong>
                  <small>
                    <Phone aria-hidden="true" /> ۰۹۳۵۶۷۸۱۲۳۴
                  </small>
                </span>
                <span className="ara-scroll-real-client-stats">
                  <b>۷ مراجعه</b>
                  <small>آخرین: ۲۹ تیر</small>
                </span>
                <CalendarPlus aria-hidden="true" />
              </div>
              <div className="ara-scroll-real-client-row">
                <span className="ara-scroll-real-client-avatar is-rose">ن</span>
                <span className="ara-scroll-real-client-info">
                  <strong>نگار رضایی</strong>
                  <small>
                    <Phone aria-hidden="true" /> ۰۹۱۰۴۴۵۶۷۸۹
                  </small>
                </span>
                <span className="ara-scroll-real-client-stats">
                  <b>۲ مراجعه</b>
                  <small>آخرین: ۱۸ تیر</small>
                </span>
                <CalendarPlus aria-hidden="true" />
              </div>
            </div>
            <div className="ara-scroll-real-client-add-row">
              <span>مشتری‌های حضوری یا قدیمی را اضافه کن</span>
              <b>+ مشتری جدید</b>
            </div>
          </div>
        </div>
      </div>
      <div className="ara-scroll-real-client-sheet">
        <div className="ara-scroll-real-client-sheet-head">
          <span className="ara-scroll-real-client-avatar is-teal">س</span>
          <span>
            <strong>سارا محمدی</strong>
            <small>جزئیات مشتری</small>
          </span>
          <UserRound aria-hidden="true" />
        </div>
        <div className="ara-scroll-real-client-contact">
          <small>راه ارتباطی</small>
          <strong>۰۹۱۲۳۴۵۶۷۸۹</strong>
          <span>
            <Phone aria-hidden="true" /> تماس <MessageCircle aria-hidden="true" /> پیامک
          </span>
        </div>
        <div className="ara-scroll-real-client-history">
          <span>
            <ListChecks aria-hidden="true" /> آخرین نوبت‌ها
          </span>
          <strong>رنگ و مش · ۳ مرداد</strong>
        </div>
      </div>
      <div className="ara-scroll-real-client-return">
        <Sparkles aria-hidden="true" />
        <span>
          <small>بازگشت مشتری</small>
          <strong>۴ مراجعه موفق</strong>
        </span>
      </div>
      <FeatureLifestylePhoto id="clients" />
    </div>
  );
}

function ScrollFeatureObject({ id }: { id: ScrollFeatureId }) {
  if (id === 'calendar') return <CalendarFeatureObject />;
  if (id === 'booking') return <BookingFeatureObject />;
  if (id === 'services') return <ServicesFeatureObject />;
  return <ClientsFeatureObject />;
}

function AraScrollFeatureSection({
  feature,
  index,
  activeFeatureId,
}: {
  feature: ScrollFeature;
  index: number;
  activeFeatureId: ScrollFeatureId | null;
}) {
  const featureRef = useRef<HTMLElement | null>(null);
  const isVisible = useInView(featureRef, {
    amount: 0.34,
    margin: '-10% 0px -10% 0px',
  });
  const prefersReducedMotion = useReducedMotion();
  const copyOffset = index % 2 === 0 ? 46 : -46;

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const normalizedX = (event.clientX - bounds.left) / bounds.width - 0.5;
    const normalizedY = (event.clientY - bounds.top) / bounds.height - 0.5;
    event.currentTarget.style.setProperty('--ara-pointer-tilt-x', `${normalizedY * -4.2}deg`);
    event.currentTarget.style.setProperty('--ara-pointer-tilt-y', `${normalizedX * 5.2}deg`);
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty('--ara-pointer-tilt-x', '0deg');
    event.currentTarget.style.setProperty('--ara-pointer-tilt-y', '0deg');
  };

  return (
    <section
      ref={featureRef}
      id={`ara-scroll-${feature.id}`}
      data-ara-scroll-section="feature"
      data-ara-scroll-feature={feature.id}
      className={`ara-scroll-feature ara-scroll-feature-${feature.id} ${isVisible ? 'is-visible' : ''} ${activeFeatureId === feature.id ? 'is-sheen-active' : ''}`}
      aria-labelledby={`ara-scroll-${feature.id}-title`}
    >
      <div
        className="ara-scroll-feature-visual"
        onPointerLeave={handlePointerLeave}
        onPointerMove={handlePointerMove}
      >
        <div className="ara-scroll-feature-stage-entry">
          <div className="ara-scroll-feature-stage">
            <div className="ara-scroll-feature-stage-glow" aria-hidden="true" />
            <ScrollFeatureObject id={feature.id} />
          </div>
        </div>
      </div>

      <motion.div
        className="ara-scroll-feature-copy"
        initial={prefersReducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: copyOffset }}
        animate={
          prefersReducedMotion || isVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: copyOffset }
        }
        transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className={`ara-scroll-feature-eyebrow is-${feature.accent}`}>
          <ScrollFeatureIcon id={feature.id} />
          {feature.eyebrow}
        </span>
        <h2 id={`ara-scroll-${feature.id}-title`}>{feature.title}</h2>
        <p>{feature.description}</p>
        <ul>
          {feature.bullets.map((bullet) => (
            <li key={bullet}>
              <Check aria-hidden="true" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
        <Link to="/business/register" className="ara-scroll-feature-link">
          {feature.cta} <ArrowUpLeft aria-hidden="true" />
        </Link>
      </motion.div>
    </section>
  );
}

export function AraScrollLanding() {
  const landingRef = useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();
  const landingTheme = theme === 'light' ? '04' : '01';
  const [activeFeatureId, setActiveFeatureId] = useState<ScrollFeatureId | null>(null);
  const { scrollYProgress } = useScroll();
  const prefersReducedMotion = useReducedMotion();
  const heroY = useTransform(scrollYProgress, [0, 0.16], [0, 68]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.16], [1, 0.15]);
  const progressScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  useEffect(() => {
    // Android browsers can trap touch scrolling when mandatory snap is
    // combined with always-stop sections. Keep the desktop/iOS interaction
    // unchanged and let Android use native vertical touch scrolling.
    const root = document.documentElement;
    if (!/Android/i.test(navigator.userAgent)) return;

    root.classList.add('ara-scroll-android');
    return () => root.classList.remove('ara-scroll-android');
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('theme')) return;

    url.searchParams.delete('theme');
    window.history.replaceState({}, '', url);
  }, []);

  useEffect(() => {
    const landing = landingRef.current;
    if (!landing) return;

    const featureSections = Array.from(
      landing.querySelectorAll<HTMLElement>('[data-ara-scroll-section="feature"]'),
    );
    const visibility = new Map<Element, IntersectionObserverEntry>();
    let previousActiveFeature: ScrollFeatureId | null = null;

    // IntersectionObserver updates the active sheen at section boundaries
    // without forcing a getBoundingClientRect pass on every scroll frame.
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => visibility.set(entry.target, entry));

        let nextActiveFeature: ScrollFeatureId | null = null;
        let highestRatio = 0;

        visibility.forEach((entry, target) => {
          if (!entry.isIntersecting || entry.intersectionRatio < highestRatio) return;

          const featureId = (target as HTMLElement).dataset.araScrollFeature as
            | ScrollFeatureId
            | undefined;
          if (!featureId) return;

          highestRatio = entry.intersectionRatio;
          nextActiveFeature = featureId;
        });

        if (nextActiveFeature === previousActiveFeature) return;
        previousActiveFeature = nextActiveFeature;
        setActiveFeatureId(nextActiveFeature);
      },
      {
        rootMargin: '-18% 0px -18% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    featureSections.forEach((section) => observer.observe(section));

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const landing = landingRef.current;
    if (!landing) return;

    let isLocked = false;
    let unlockTimer: number | undefined;
    let sectionMetrics:
      | {
          sections: HTMLElement[];
          tops: number[];
        }
      | undefined;

    const getSectionMetrics = () => {
      if (sectionMetrics) return sectionMetrics;

      const sections = Array.from(
        landing.querySelectorAll<HTMLElement>('[data-ara-scroll-section]'),
      );
      sectionMetrics = {
        sections,
        tops: sections.map((section) => section.getBoundingClientRect().top + window.scrollY),
      };
      return sectionMetrics;
    };

    const getCurrentSectionIndex = (tops: number[]) => {
      const currentScroll = window.scrollY;
      return tops.reduce((closestIndex, top, index) => {
        const currentDistance = Math.abs(top - currentScroll);
        const closestDistance = Math.abs(tops[closestIndex] - currentScroll);
        return currentDistance < closestDistance ? index : closestIndex;
      }, 0);
    };

    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      );
    };

    const moveBySection = (direction: 1 | -1) => {
      if (isLocked) return;

      const { sections, tops } = getSectionMetrics();
      if (sections.length === 0) return;

      const currentIndex = getCurrentSectionIndex(tops);
      const nextIndex = Math.min(Math.max(currentIndex + direction, 0), sections.length - 1);
      if (nextIndex === currentIndex) return;

      isLocked = true;
      window.scrollTo({
        top: tops[nextIndex],
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });

      window.clearTimeout(unlockTimer);
      unlockTimer = window.setTimeout(
        () => {
          isLocked = false;
        },
        prefersReducedMotion ? 120 : 480,
      );
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.deltaY === 0 || isTypingTarget(event.target)) return;
      if (isLocked) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      moveBySection(event.deltaY > 0 ? 1 : -1);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (
        (activeElement !== document.body && !landing.contains(activeElement)) ||
        isTypingTarget(event.target)
      ) {
        return;
      }

      const downKeys = new Set(['ArrowDown', 'PageDown', ' ']);
      const upKeys = new Set(['ArrowUp', 'PageUp']);
      if (!downKeys.has(event.key) && !upKeys.has(event.key)) return;

      event.preventDefault();
      moveBySection(downKeys.has(event.key) ? 1 : -1);
    };

    landing.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    const handleResize = () => {
      sectionMetrics = undefined;
    };
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      landing.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
      window.clearTimeout(unlockTimer);
    };
  }, [prefersReducedMotion]);

  return (
    <div
      ref={landingRef}
      data-testid="ara-scroll-landing"
      className="ara-scroll-page"
      data-scroll-theme={landingTheme}
      dir="rtl"
      lang="fa"
    >
      <SeoHead
        title="آرا؛ نوبت‌های منظم‌تر، سالن آرام‌تر"
        description={SCROLL_LANDING_DESCRIPTION}
        path="/"
        index
      />
      <JsonLd
        data={[
          { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL, inLanguage: 'fa-IR' },
          {
            '@type': 'SoftwareApplication',
            name: SITE_NAME,
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            description: SCROLL_LANDING_DESCRIPTION,
            url: SITE_URL,
          },
        ]}
      />

      <AraScrollBrandRail />

      <main className="ara-scroll-main">
        <section
          className="ara-scroll-hero"
          data-ara-scroll-section="hero"
          aria-labelledby="ara-scroll-hero-title"
        >
          <div className="ara-scroll-hero-inner">
            <motion.div
              className="ara-scroll-hero-copy"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="ara-scroll-eyebrow">
                <i aria-hidden="true" /> برای سالن‌دارهایی که هر روز پاسخ‌گوی تماس‌اند
              </span>
              <h1 id="ara-scroll-hero-title">
                از تماس‌های تکراری تا رزرو قطعی،
                <span>در یک لینک.</span>
              </h1>
              <p>
                یک لینک رزرو و QR برای مشتری، یک تقویم شمسی برای تو و تجربه‌ای ساده برای هماهنگی.
                مشتری خدمت و زمان را خودش انتخاب می‌کند؛ نوبت مستقیم در برنامه‌ات ثبت می‌شود.
              </p>
              <div className="ara-scroll-hero-actions">
                <Link
                  to="/business/register"
                  className="ara-scroll-button ara-scroll-button-primary"
                >
                  راه‌اندازی رایگان سالن <ArrowUpLeft aria-hidden="true" />
                </Link>
                <a
                  href="#ara-scroll-calendar"
                  className="ara-scroll-button ara-scroll-button-secondary"
                >
                  ببین چطور کار می‌کند <ArrowDownLeft aria-hidden="true" />
                </a>
              </div>
              <div className="ara-scroll-hero-trust">
                <span>
                  <Check aria-hidden="true" /> تقویم شمسی دقیق
                </span>
                <span>
                  <Check aria-hidden="true" /> ۱۴ روز رایگان، بدون کارت بانکی
                </span>
                <span>
                  <Check aria-hidden="true" /> رزرو بدون تماس تلفنی
                </span>
              </div>
            </motion.div>

            <motion.div
              className="ara-scroll-hero-visual"
              style={
                prefersReducedMotion
                  ? undefined
                  : {
                      y: heroY,
                      opacity: heroOpacity,
                    }
              }
            >
              <AraScrollHeroObject />
            </motion.div>
          </div>
          <a
            href="#ara-scroll-calendar"
            className="ara-scroll-scroll-hint"
            aria-label="رفتن به فیچر تقویم"
          >
            <span>اسکرول کن</span>
            <ArrowDownLeft aria-hidden="true" />
          </a>
        </section>

        <div className="ara-scroll-story-intro" aria-hidden="true">
          <span>کمتر تلفن جواب بده؛ بیشتر روی مشتری تمرکز کن.</span>
          <i />
        </div>

        {SCROLL_FEATURES.map((feature, index) => (
          <AraScrollFeatureSection
            activeFeatureId={activeFeatureId}
            feature={feature}
            index={index}
            key={feature.id}
          />
        ))}

        <section
          className="ara-scroll-final-cta"
          data-ara-scroll-section="final"
          aria-labelledby="ara-scroll-final-title"
        >
          <span className="ara-scroll-eyebrow">
            <i aria-hidden="true" /> از همین امروز شروع کن
          </span>
          <h2 id="ara-scroll-final-title">
            تماس‌های تکراری کمتر،
            <span>نوبت‌های منظم‌تر.</span>
          </h2>
          <p>۱۴ روز رایگان امتحان کن؛ بدون کارت بانکی و بدون نصب اپ برای مشتری.</p>
          <Link to="/business/register" className="ara-scroll-button ara-scroll-button-primary">
            راه‌اندازی رایگان سالن <ArrowUpLeft aria-hidden="true" />
          </Link>
        </section>
      </main>

      <div className="ara-scroll-landing-footer" data-ara-scroll-section="footer">
        <PublicFooter />
      </div>

      <div className="ara-scroll-progress" aria-hidden="true">
        <span>پیشرفت معرفی</span>
        <div>
          <motion.i style={{ scaleX: progressScale }} />
        </div>
      </div>
    </div>
  );
}
