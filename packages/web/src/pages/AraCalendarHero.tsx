import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useRef } from 'react';
import {
  BellRing,
  CalendarDays,
  Check,
  Clock3,
  ContactRound,
  Link2,
  Scissors,
  UsersRound,
} from 'lucide-react';
import './AraCalendarHero.css';

const bookingTimes = ['۱۰:۰۰', '۱۱:۳۰', '۱۴:۳۰', '۱۶:۰۰'] as const;

function AraCalendarDesktop() {
  return (
    <div className="ara-calendar-desktop-device" aria-hidden="true">
      <div className="ara-calendar-desktop-hinge" />
      <div className="ara-calendar-desktop-frame">
        <div className="ara-calendar-desktop-screen">
          <div className="ara-calendar-desktop-ui">
            <aside className="ara-calendar-desktop-sidebar">
              <strong>آرا</strong>
              <span className="is-active">
                <CalendarDays aria-hidden="true" />
              </span>
              <span>
                <UsersRound aria-hidden="true" />
              </span>
              <span>
                <Scissors aria-hidden="true" />
              </span>
              <span>
                <ContactRound aria-hidden="true" />
              </span>
              <span className="is-bottom">
                <BellRing aria-hidden="true" />
              </span>
            </aside>
            <div className="ara-calendar-desktop-body">
              <div className="ara-calendar-desktop-heading">
                <div>
                  <small>تقویم امروز</small>
                  <strong>شنبه ۳ مرداد ۱۴۰۵</strong>
                </div>
                <span>+ نوبت جدید</span>
              </div>
              <div className="ara-calendar-desktop-tabs">
                <span className="is-active">روز</span>
                <span>هفته</span>
                <span>ماه</span>
                <span>فهرست</span>
              </div>
              <div className="ara-calendar-desktop-team">
                <span>زمان</span>
                <span className="is-selected">همه</span>
                <span>مریم</span>
                <span>سارا</span>
                <span>نگار</span>
              </div>
              <div className="ara-calendar-desktop-grid">
                <div className="ara-calendar-desktop-hours">
                  <span>۰۸</span>
                  <span>۱۰</span>
                  <span>۱۲</span>
                  <span>۱۴</span>
                  <span>۱۶</span>
                  <span>۱۸</span>
                </div>
                <div className="ara-calendar-desktop-grid-body">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <div className="ara-calendar-desktop-appointment is-teal">
                    <strong>کوتاهی و براشینگ</strong>
                    <small>مریم احمدی · ۰۹:۰۰</small>
                  </div>
                  <div className="ara-calendar-desktop-appointment is-violet">
                    <strong>فیشال پوست</strong>
                    <small>نگار رضایی · ۱۳:۳۰</small>
                  </div>
                  <div className="ara-calendar-desktop-appointment is-rose">
                    <strong>رنگ و مش</strong>
                    <small>سارا محمدی · ۱۶:۳۰</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="ara-calendar-desktop-gloss" />
        </div>
      </div>
      <div className="ara-calendar-desktop-base">
        <span />
      </div>
    </div>
  );
}

function AraCalendarPhone() {
  return (
    <div className="ara-calendar-phone" aria-hidden="true">
      <div className="ara-calendar-phone-shell">
        <div className="ara-calendar-phone-camera" />
        <div className="ara-calendar-phone-screen ara-calendar-booking-screen">
          <div className="ara-calendar-phone-topbar">
            <span className="ara-calendar-phone-back">‹</span>
            <span className="ara-calendar-phone-progress">
              <i className="is-active" />
              <i />
              <i />
            </span>
            <span className="ara-calendar-phone-brand">
              <strong>رزرو آنلاین</strong>
              <small>آرا</small>
            </span>
          </div>
          <div className="ara-calendar-phone-body ara-calendar-booking-body">
            <div className="ara-calendar-booking-salon">
              <span className="ara-calendar-booking-salon-mark">آ</span>
              <span>
                <strong>سالن مریم</strong>
                <small>تهران · سعادت‌آباد</small>
              </span>
            </div>
            <div className="ara-calendar-phone-heading ara-calendar-booking-heading">
              <span>گام ۳ از ۳ · انتخاب زمان</span>
              <strong>نوبتت رو انتخاب کن</strong>
            </div>
            <div className="ara-calendar-booking-service">
              <span className="ara-calendar-booking-service-icon">
                <Scissors aria-hidden="true" />
              </span>
              <span>
                <strong>کوتاهی و براشینگ</strong>
                <small>۶۰ دقیقه · ۴۵۰٬۰۰۰ تومان</small>
              </span>
              <Check aria-hidden="true" />
            </div>
            <div className="ara-calendar-booking-date-heading">
              <CalendarDays aria-hidden="true" />
              <span>شنبه ۳ مرداد ۱۴۰۵</span>
            </div>
            <div className="ara-calendar-booking-date-row">
              <span>
                <small>جمعه</small>
                <strong>۲ مرداد</strong>
              </span>
              <span className="is-selected">
                <small>شنبه</small>
                <strong>۳ مرداد</strong>
              </span>
              <span>
                <small>یکشنبه</small>
                <strong>۴ مرداد</strong>
              </span>
            </div>
            <div className="ara-calendar-booking-time-heading">
              <Clock3 aria-hidden="true" />
              <span>ساعت‌های خالی</span>
            </div>
            <div className="ara-calendar-booking-times">
              {bookingTimes.map((time) => (
                <span className={time === '۱۴:۳۰' ? 'is-selected' : ''} key={time}>
                  {time}
                </span>
              ))}
            </div>
            <div className="ara-calendar-booking-footer">
              <span>
                <Check aria-hidden="true" />
                زمان انتخابی
              </span>
              <strong>۱۴:۳۰</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AraFeatureObjects({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`ara-calendar-feature-objects${compact ? ' is-compact' : ''}`}
      aria-hidden="true"
    >
      <div className="ara-calendar-float-card ara-calendar-float-booking">
        <span className="ara-calendar-float-icon is-violet">
          <Link2 />
        </span>
        <span>
          <small>رزرو جدید</small>
          <strong>رنگ و مش · ۱۶:۳۰</strong>
        </span>
        <Check />
      </div>

      <div className="ara-calendar-float-card ara-calendar-float-reminder">
        <span className="ara-calendar-float-icon is-teal">
          <BellRing />
        </span>
        <span>
          <small>یادآوری مشتری</small>
          <strong>پیام ارسال شد</strong>
        </span>
        <span className="ara-calendar-float-status">✓</span>
      </div>

      <div className="ara-calendar-float-card ara-calendar-float-service">
        <span className="ara-calendar-float-icon is-blue">
          <Scissors />
        </span>
        <span>
          <small>خدمت انتخاب شد</small>
          <strong>کوتاهی و براشینگ</strong>
        </span>
      </div>

      <div className="ara-calendar-float-orb ara-calendar-float-customers">
        <span className="ara-calendar-orb-ring" />
        <UsersRound />
        <strong>۷۸٪</strong>
        <small>بازگشت مشتری</small>
      </div>

      <div className="ara-calendar-float-pill ara-calendar-float-link">
        <Link2 /> <span>لینک رزرو برای بیو</span>
      </div>
    </div>
  );
}

export function AraCalendarHero({
  compact = false,
  showPhone = true,
}: {
  compact?: boolean;
  showPhone?: boolean;
}) {
  const sceneRef = useRef<HTMLDivElement>(null);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = sceneRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    sceneRef.current?.style.setProperty(
      '--ara-calendar-scene-transform',
      `rotateX(${pointerY * -2}deg) rotateY(${pointerX * 3}deg)`,
    );
  };

  const handlePointerLeave = () => {
    sceneRef.current?.style.setProperty(
      '--ara-calendar-scene-transform',
      'rotateX(0deg) rotateY(0deg)',
    );
  };

  return (
    <div
      ref={sceneRef}
      className={`ara-calendar-hero-scene${compact ? ' is-compact' : ''}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{ '--ara-calendar-scene-transform': 'rotateX(0deg) rotateY(0deg)' } as CSSProperties}
      role="img"
      aria-label={
        showPhone
          ? 'نمایش سه‌بعدی تقویم آرا روی دسکتاپ و گوشی'
          : 'نمایش سه‌بعدی تقویم آرا روی دسکتاپ'
      }
    >
      <div className="ara-calendar-scene-glow" aria-hidden="true" />
      <div className="ara-calendar-scene-content">
        <AraCalendarDesktop />
        {showPhone ? <AraCalendarPhone /> : null}
        <AraFeatureObjects compact={compact} />
      </div>
      <div className="ara-calendar-scene-caption" aria-hidden="true">
        <span>
          <CalendarDays /> تقویم شمسی آرا
        </span>
        <span>
          <Check /> همه‌چیز در یک نگاه
        </span>
      </div>
    </div>
  );
}
