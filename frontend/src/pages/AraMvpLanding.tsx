import { ArrowUpLeft, Check, Play, QrCode, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { JsonLd, SeoHead, SITE_NAME, SITE_URL } from '../components/seo';
import { ThemeToggle } from '../components/theme';
import { AraCalendarHero } from './AraCalendarHero';
import { AraScrollLanding } from './AraScrollLanding';

const LANDING_DESCRIPTION =
  'آرا نوبت‌های حضوری و آنلاین سالن را در تقویم شمسی جمع می‌کند؛ لینک و QR رزرو کمک می‌کند مشتری بدون تماس تلفنی وقت بگیرد.';

function AraCalendarBrandRail() {
  return (
    <div className="ara-calendar-brand-rail" aria-label="دسترسی‌های آرا">
      <Link to="/" className="ara-calendar-brand-logo" aria-label="صفحهٔ اصلی آرا">
        <img
          className="ara-calendar-brand-logo-light"
          src="/brand/ara-logo.png"
          alt="آرا"
          width={955}
          height={480}
          loading="eager"
          decoding="async"
        />
        <img
          className="ara-calendar-brand-logo-dark"
          src="/brand/ara-logo-dark.png"
          alt=""
          width={955}
          height={480}
          loading="eager"
          decoding="async"
        />
      </Link>
      <div className="ara-calendar-brand-actions">
        <Link to="/search" className="ara-calendar-login">
          رزرو نوبت
        </Link>
        <Link to="/auth" className="ara-calendar-login">
          ورود
        </Link>
        <ThemeToggle className="ara-calendar-theme-toggle" />
      </div>
    </div>
  );
}

function AraCalendarLanding() {
  const [videoOpen, setVideoOpen] = useState(false);

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has('model')) {
      currentUrl.searchParams.delete('model');
      window.history.replaceState({}, '', currentUrl);
    }

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  useEffect(() => {
    if (!videoOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVideoOpen(false);
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [videoOpen]);

  return (
    <div
      data-testid="ara-mvp-landing"
      data-ara-landing-theme="night"
      className="ara-calendar-page"
      dir="rtl"
      lang="fa"
    >
      <SeoHead title="مدیریت سالن با آرا" description={LANDING_DESCRIPTION} path="/" index />
      <JsonLd
        data={[
          { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL, inLanguage: 'fa-IR' },
          {
            '@type': 'SoftwareApplication',
            name: SITE_NAME,
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            description: LANDING_DESCRIPTION,
            url: SITE_URL,
          },
        ]}
      />

      <main className="ara-calendar-main">
        <AraCalendarBrandRail />
        <section className="ara-calendar-hero" aria-labelledby="ara-calendar-title">
          <div className="ara-calendar-copy">
            <span className="ara-calendar-eyebrow">
              <i aria-hidden="true" /> برای سالن‌دارهایی که هر روز پاسخ‌گوی تماس‌اند
            </span>
            <h1 id="ara-calendar-title">
              از تماس‌های تکراری تا رزرو قطعی،
              <span>در یک لینک.</span>
            </h1>
            <p>
              یک لینک رزرو و QR برای مشتری، یک تقویم شمسی برای تو و تجربه‌ای ساده برای هماهنگی.
              مشتری خدمت و زمان را خودش انتخاب می‌کند؛ نوبت مستقیم در برنامه‌ات ثبت می‌شود.
            </p>
            <div className="ara-calendar-actions">
              <Link
                to="/business/register"
                className="ara-calendar-button ara-calendar-button-primary"
              >
                راه‌اندازی رایگان سالن <ArrowUpLeft aria-hidden="true" />
              </Link>
              <button
                type="button"
                className="ara-calendar-button ara-calendar-button-secondary"
                onClick={() => setVideoOpen(true)}
              >
                <Play aria-hidden="true" /> مشاهدهٔ یک روز کاری
              </button>
            </div>
            <ul className="ara-calendar-trust" aria-label="مزیت‌های اصلی آرا">
              <li>
                <Check aria-hidden="true" /> تقویم شمسی واقعی
              </li>
              <li>
                <Check aria-hidden="true" /> رزرو بدون تماس تلفنی
              </li>
              <li>
                <Check aria-hidden="true" /> بدون اپ برای مشتری
              </li>
              <li>
                <Check aria-hidden="true" /> ۱۴ روز رایگان، بدون کارت بانکی
              </li>
            </ul>
            <div className="ara-calendar-copy-note">
              <QrCode aria-hidden="true" />
              <span>
                لینک رزرو آرا را روی QR سالن، کارت ویزیت، واتساپ یا اینستاگرام بگذار؛ مشتری خودش
                خدمت و زمان مناسب را انتخاب می‌کند.
              </span>
            </div>
          </div>

          <div id="ara-calendar-demo" className="ara-calendar-visual-wrap">
            <AraCalendarHero />
          </div>
        </section>
      </main>

      {videoOpen ? (
        <div
          className="ara-calendar-video-modal"
          role="dialog"
          aria-modal="true"
          aria-label="دموی آرا"
          onClick={() => setVideoOpen(false)}
        >
          <div className="ara-calendar-video-frame" onClick={(event) => event.stopPropagation()}>
            <video autoPlay controls playsInline poster="/images/hero/poster-iran.webp">
              <source src="/videos/hero-iran-steady.webm" type="video/webm" />
            </video>
          </div>
          <button
            type="button"
            className="ara-calendar-video-close"
            aria-label="بستن ویدیو"
            onClick={() => setVideoOpen(false)}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function isCalendarLandingVariant() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('version') === 'calendar';
}

export function AraMvpLanding() {
  return isCalendarLandingVariant() ? <AraCalendarLanding /> : <AraScrollLanding />;
}

export default AraMvpLanding;
