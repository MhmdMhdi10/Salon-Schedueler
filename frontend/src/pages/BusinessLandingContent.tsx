import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Camera,
  Check,
  CircleDollarSign,
  Clock3,
  Copy,
  CreditCard,
  Crown,
  Headphones,
  LayoutDashboard,
  Link2,
  ListChecks,
  MessageCircle,
  MousePointer2,
  PanelTop,
  Phone,
  Plus,
  QrCode,
  Receipt,
  RefreshCw,
  Scissors,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  Users,
  WalletCards,
  WandSparkles,
  Zap,
} from 'lucide-react';
import { cn } from '../components/ui';

type LandingVariant =
  | 'business'
  | 'day'
  | 'card'
  | 'heatmap'
  | 'command'
  | 'compare'
  | 'mirror'
  | 'loop'
  | 'backstage'
  | 'funnel'
  | 'checklist';

const VARIANTS: LandingVariant[] = [
  'business',
  'day',
  'card',
  'heatmap',
  'command',
  'compare',
  'mirror',
  'loop',
  'backstage',
  'funnel',
  'checklist',
];

const VARIANT_LABELS: Record<LandingVariant, string> = {
  business: 'آرا بیز',
  day: 'روز سالن',
  card: 'کارت زنده',
  heatmap: 'نقشه ظرفیت',
  command: 'اتاق فرمان',
  compare: 'قبل / بعد',
  mirror: 'آینه',
  loop: 'چرخه مشتری',
  backstage: 'پشت‌صحنه',
  funnel: 'قیف اینستاگرام',
  checklist: 'یک برگه',
};

const FAQS = [
  {
    question: 'راه‌اندازی آرا چقدر زمان می‌برد؟',
    answer:
      'پس از ثبت شماره، نام سالن و خدمات اصلی، صفحهٔ رزرو و پنل شما آماده است. جزئیات، اعضای تیم و ساعت کاری را می‌توانید همان موقع یا بعدتر تکمیل کنید.',
  },
  {
    question: 'مشتری برای رزرو باید اپ نصب کند؟',
    answer:
      'خیر. مشتری از مرورگر، خدمت و زمان را انتخاب می‌کند و بدون نصب برنامه یا ساختن حساب کاربری نوبتش را ثبت می‌کند.',
  },
  {
    question: 'لینک رزرو را کجا منتشر کنم؟',
    answer:
      'لینک و QR اختصاصی سالن را می‌توانید در بیوی اینستاگرام، استوری، پیام‌رسان‌ها، کارت و ویترین سالن قرار دهید.',
  },
  {
    question: 'نوبت‌های فعلی‌ام را چطور مدیریت کنم؟',
    answer:
      'نوبت‌های از قبل ثبت‌شده را در تقویم آرا وارد کنید و لینک رزرو آنلاین را برای نوبت‌های تازه با مشتری‌ها به اشتراک بگذارید.',
  },
  {
    question: 'شروع استفاده هزینه دارد؟',
    answer:
      'شروع با دورهٔ آزمایشی رایگان است. تعرفهٔ اشتراک‌ها پیش از هر پرداخت داخل پنل نمایش داده می‌شود و برای شروع نیازی به کارت بانکی نیست.',
  },
  {
    question: 'اگر هنگام راه‌اندازی سؤال داشته باشم چه؟',
    answer: 'پشتیبانی فارسی آرا برای راه‌اندازی پروفایل، خدمات و تقویم همراه شماست.',
  },
] as const;

const primaryCtaClass = cn(
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-6',
  'font-semibold text-primary-contrast no-underline shadow-1',
  'transition-all duration-fast ease-standard hover:-translate-y-0.5 hover:shadow-2',
  'outline-none focus-visible:outline focus-visible:outline-2',
  'focus-visible:outline-offset-2 focus-visible:outline-focus',
);

const secondaryCtaClass = cn(
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-border',
  'bg-elevated px-6 font-semibold text-primary no-underline',
  'transition-colors duration-fast ease-standard hover:border-primary hover:text-primary',
  'outline-none focus-visible:outline focus-visible:outline-2',
  'focus-visible:outline-offset-2 focus-visible:outline-focus',
);

type IconComponent = React.ElementType;

function formatRial(value: number) {
  return new Intl.NumberFormat('fa-IR').format(value);
}

function SectionHeader({
  eyebrow,
  title,
  body,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  dark?: boolean;
}) {
  return (
    <div className="max-w-2xl">
      <p className={cn('text-xs font-bold tracking-wider', dark ? 'text-accent' : 'text-primary')}>
        {eyebrow}
      </p>
      <h2 className={cn('mt-3 text-2xl text-display sm:text-3xl', dark && 'text-ink-contrast')}>
        {title}
      </h2>
      {body ? (
        <p className={cn('mt-4 text-md leading-8', dark ? 'text-ink-muted' : 'text-muted')}>
          {body}
        </p>
      ) : null}
    </div>
  );
}

function TrustRail({
  dark = false,
  items = ['بدون کارت بانکی', 'بدون نصب برای مشتری', 'پشتیبانی فارسی'],
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap gap-x-5 gap-y-2 text-sm',
        dark ? 'text-ink-muted' : 'text-muted',
      )}
    >
      {items.map((item) => (
        <span key={item} className="flex items-center gap-2">
          <Check
            className={cn('size-4', dark ? 'text-accent' : 'text-primary')}
            aria-hidden="true"
          />
          {item}
        </span>
      ))}
    </div>
  );
}

function HeroActions({
  primaryLabel,
  secondaryLabel = 'ورود به پنل',
}: {
  primaryLabel: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <Link
        to="/business/register"
        data-hero-cta="primary"
        data-cta="primary"
        className={primaryCtaClass}
      >
        {primaryLabel}
        <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </Link>
      <Link to="/auth" data-cta="secondary" className={secondaryCtaClass}>
        {secondaryLabel}
      </Link>
    </div>
  );
}

function OwnerImage({
  className,
  loading = 'lazy',
}: {
  className?: string;
  loading?: 'eager' | 'lazy';
}) {
  return (
    <img
      src="/images/business/iranian-salon-owner-at-work.webp"
      alt="مدیر ایرانی سالن زیبایی در حال رسیدگی به موی مشتری در فضای گرم و حرفه‌ای سالن"
      width={1536}
      height={1024}
      loading={loading}
      decoding="async"
      className={cn('h-full w-full object-cover', className)}
    />
  );
}

function DashboardImage({ className }: { className?: string }) {
  return (
    <img
      src="/screenshots/admin-desktop.png"
      alt="نمای تقویم و داشبورد مدیریت سالن در آرا"
      width={1920}
      height={1080}
      loading="lazy"
      decoding="async"
      className={cn('aspect-video w-full object-cover object-top', className)}
    />
  );
}

function BookingImage({ className }: { className?: string }) {
  return (
    <img
      src="/screenshots/booking-mobile.png"
      alt="نمای موبایلی رزرو نوبت مشتری در آرا"
      width={1080}
      height={1920}
      loading="lazy"
      decoding="async"
      className={cn('aspect-[9/16] w-full object-cover object-top', className)}
    />
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const answerId = 'faq-answer-' + useId().replace(/:/g, '');

  return (
    <div className="border-b border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={answerId}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-4 py-4 text-start font-bold outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span className="min-w-0">{question}</span>
        <span
          className={cn(
            'shrink-0 text-xl font-normal leading-none text-primary transition-transform duration-fast motion-reduce:transition-none',
            open && 'rotate-45',
          )}
          aria-hidden="true"
        >
          +
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="answer"
            id={answerId}
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
            transition={
              prefersReducedMotion ? { duration: 0 } : { duration: 0.28, ease: 'easeOut' }
            }
            className="overflow-hidden"
          >
            <p className="max-w-3xl pb-6 text-sm leading-8 text-muted">{answer}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function FAQSection() {
  return (
    <section className="border-t border-border py-16 sm:py-20" aria-labelledby="faq-heading">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[0.65fr_1.35fr]">
        <div>
          <p className="text-xs font-bold tracking-wider text-primary">پرسش‌های پیش از شروع</p>
          <h2 id="faq-heading" className="mt-3 text-2xl text-display sm:text-3xl">
            جواب روشن، پیش از تصمیم
          </h2>
          <p className="mt-4 text-muted">
            سؤال دیگری دارید؟{' '}
            <Link
              to="/contact"
              className="inline-flex min-h-10 items-center font-semibold text-primary"
            >
              با پشتیبانی فارسی آرا صحبت کنید.
            </Link>
          </p>
        </div>
        <div className="border-t border-border">
          {FAQS.map((faq) => (
            <FAQItem key={faq.question} {...faq} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ title, body, dark = false }: { title: string; body: string; dark?: boolean }) {
  return (
    <section
      className={cn(
        'relative overflow-hidden py-16 sm:py-20',
        dark ? 'bg-ink text-ink-contrast' : 'bg-primary text-primary-contrast',
      )}
    >
      <div className="relative mx-auto grid max-w-5xl gap-6 px-4 text-center sm:gap-8">
        <Crown className="mx-auto size-7" aria-hidden="true" />
        <h2 className="text-2xl font-display leading-display sm:text-4xl">{title}</h2>
        <p className="mx-auto max-w-2xl text-md leading-8 opacity-90">{body}</p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            to="/business/register"
            className={cn(
              'inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-7 font-bold no-underline shadow-2 hover:opacity-90',
              dark ? 'bg-accent text-ink' : 'bg-primary-contrast text-primary',
            )}
          >
            رایگان شروع کنید
            <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </Link>
        </div>
        <TrustRail
          dark={dark}
          items={['راه‌اندازی سریع', 'لینک رزرو اختصاصی', 'رزرو آنلاین ۲۴ ساعته']}
        />
      </div>
    </section>
  );
}

function VariantTabs({ active }: { active: LandingVariant }) {
  return (
    <div
      className="mx-auto flex max-w-7xl gap-2 overflow-x-auto border-b border-border px-4 py-3"
      aria-label="نسخه‌های لندینگ"
    >
      {VARIANTS.map((variant) => (
        <a
          key={variant}
          href={'/?variant=' + variant + '&preview=1'}
          aria-current={active === variant ? 'page' : undefined}
          className={cn(
            'shrink-0 rounded-pill border px-3 py-1.5 text-xs font-semibold no-underline transition-colors',
            active === variant
              ? 'border-primary bg-primary text-primary-contrast'
              : 'border-border bg-elevated text-muted hover:border-primary hover:text-primary',
          )}
        >
          {VARIANT_LABELS[variant]}
        </a>
      ))}
    </div>
  );
}

function FeatureRows({
  items,
  dark = false,
}: {
  items: Array<{ icon: IconComponent; title: string; body: string }>;
  dark?: boolean;
}) {
  return (
    <ul
      className={cn(
        'divide-y border-y',
        dark ? 'divide-ink-border border-ink-border' : 'divide-border border-border',
      )}
    >
      {items.map(({ icon: Icon, title, body }) => (
        <li key={title} className="flex gap-3 py-5">
          <Icon
            className={cn('mt-1 size-5 shrink-0', dark ? 'text-accent' : 'text-primary')}
            aria-hidden="true"
          />
          <div>
            <h3 className={cn('font-bold', dark && 'text-ink-contrast')}>{title}</h3>
            <p className={cn('mt-1 text-sm leading-7', dark ? 'text-ink-muted' : 'text-muted')}>
              {body}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function NumberedSteps({ items, dark = false }: { items: string[]; dark?: boolean }) {
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {items.map((item, index) => (
        <li
          key={item}
          className={cn('border-t pt-5', dark ? 'border-ink-border' : 'border-border')}
        >
          <span className={cn('text-xs font-bold', dark ? 'text-accent' : 'text-primary')}>
            ۰{index + 1}
          </span>
          <p className={cn('mt-4 text-sm leading-7', dark ? 'text-ink-muted' : 'text-muted')}>
            {item}
          </p>
        </li>
      ))}
    </ol>
  );
}

function DayTimeline() {
  const slots = [
    ['۰۹:۰۰', 'رنگ و مش', 'رزرو شد', 'bg-primary/10'],
    ['۱۱:۳۰', 'کوتاهی', 'رزرو شد', 'bg-primary/10'],
    ['۱۳:۰۰', 'زمان آزاد', 'یک فرصت برای امروز', 'bg-warning/20'],
    ['۱۵:۰۰', 'میکاپ', 'رزرو شد', 'bg-primary/10'],
  ];
  return (
    <div className="relative rounded-2xl border border-ink-border bg-ink p-4 text-ink-contrast shadow-3 sm:p-6">
      <div className="flex items-center justify-between border-b border-ink-border pb-4">
        <div>
          <p className="text-xs text-ink-muted">امروز، ۲۲ مرداد</p>
          <p className="mt-1 font-bold">تقویم سالن رز</p>
        </div>
        <span className="rounded-pill bg-accent/15 px-3 py-1 text-xs font-bold text-accent">
          ۳ رزرو
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {slots.map(([time, title, status, color], index) => (
          <div key={time} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3">
            <span className="text-xs tabular-nums text-ink-muted">{time}</span>
            <div className={cn('rounded-md border border-ink-border px-3 py-3', color)}>
              <p className="text-sm font-bold">{title}</p>
              <p className="mt-1 text-2xs text-ink-muted">{status}</p>
            </div>
            {index === 2 ? (
              <Plus className="size-4 text-accent" aria-label="افزودن نوبت" />
            ) : (
              <Check className="size-4 text-accent" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between rounded-md bg-primary/15 px-3 py-2 text-xs">
        <span className="text-ink-muted">ظرفیت امروز</span>
        <strong className="text-accent">یک جای خالی</strong>
      </div>
    </div>
  );
}

function BusinessHeroScene() {
  return (
    <figure className="relative mx-auto w-full max-w-2xl">
      <div
        className="absolute -end-5 -top-5 size-28 rounded-full border border-primary/20 bg-primary/5 sm:-end-8 sm:-top-8 sm:size-40"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-5 -start-5 h-28 w-36 rounded-3xl border border-warning/30 bg-warning/10 sm:-bottom-8 sm:-start-8 sm:h-40 sm:w-52"
        aria-hidden="true"
      />
      <div className="relative overflow-hidden rounded-[2rem] border border-border bg-ink p-2 shadow-3 sm:p-3">
        <div className="relative min-h-[28rem] overflow-hidden rounded-[1.5rem] bg-ink sm:min-h-[34rem]">
          <OwnerImage loading="eager" className="object-[center_32%] opacity-90" />
          <div
            className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-ink/5"
            aria-hidden="true"
          />
          <div className="absolute inset-x-4 top-4 flex items-center justify-between gap-3 text-xs text-ink-contrast sm:inset-x-6 sm:top-6">
            <span className="rounded-pill border border-ink-border bg-ink/70 px-3 py-2 backdrop-blur-sm">
              آرا برای سالن
            </span>
            <span className="flex items-center gap-2 rounded-pill bg-accent px-3 py-2 font-bold text-ink">
              <span className="size-1.5 rounded-full bg-ink" aria-hidden="true" />
              آمادهٔ رزرو
            </span>
          </div>
          <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-ink-border bg-ink/85 p-4 text-ink-contrast backdrop-blur-md sm:inset-x-6 sm:bottom-6 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-ink-muted">امروز، برنامهٔ سالن</p>
                <p className="mt-1 text-lg font-bold sm:text-xl">سالن آینه</p>
              </div>
              <div className="rounded-xl bg-primary/20 p-2.5 text-accent">
                <CalendarDays className="size-5" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-ink-border pt-4">
              <div>
                <p className="text-lg font-bold tabular-nums">۰۶</p>
                <p className="mt-1 text-2xs text-ink-muted">رزرو امروز</p>
              </div>
              <div>
                <p className="text-lg font-bold text-accent">۰۱</p>
                <p className="mt-1 text-2xs text-ink-muted">جای خالی</p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums">۲۴/۷</p>
                <p className="mt-1 text-2xs text-ink-muted">رزرو آنلاین</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        مدیر ایرانی سالن زیبایی در کنار نمایی از برنامهٔ روزانه و ظرفیت رزرو سالن در آرا.
      </figcaption>
    </figure>
  );
}

function GrowthBoardMock() {
  return (
    <div className="rounded-2xl border border-ink-border bg-ink p-4 text-ink-contrast shadow-3 sm:p-6">
      <div className="flex items-start justify-between gap-4 border-b border-ink-border pb-5">
        <div>
          <p className="text-2xs font-bold tracking-widest text-accent">ARA / GROWTH</p>
          <p className="mt-2 text-lg font-bold">ورودی‌های سالن</p>
          <p className="mt-1 text-xs text-ink-muted">نمونهٔ نمایشی از مسیرهای قابل اندازه‌گیری</p>
        </div>
        <BarChart3 className="size-5 text-accent" aria-hidden="true" />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          { icon: Camera, label: 'بیوی اینستاگرام', value: 'قابل ردیابی', tone: 'bg-primary/20' },
          { icon: QrCode, label: 'QR داخل سالن', value: 'آمادهٔ اسکن', tone: 'bg-accent/15' },
          { icon: Send, label: 'لینک دعوت مشتری', value: 'قابل اشتراک', tone: 'bg-warning/15' },
          { icon: RefreshCw, label: 'مراجعهٔ بعدی', value: 'قابل پیگیری', tone: 'bg-primary/20' },
        ].map(({ icon: Icon, label, value, tone }) => (
          <div key={label} className="rounded-xl border border-ink-border p-3">
            <div className="flex items-center gap-3">
              <span className={cn('grid size-9 place-items-center rounded-lg', tone)}>
                <Icon className="size-4 text-accent" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">{label}</p>
                <p className="mt-1 text-2xs text-ink-muted">{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-xl border border-accent/30 bg-accent/10 p-4">
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="text-ink-muted">مسیر پیشنهادی کمپین</span>
          <span className="font-bold text-accent">بیو ← لینک رزرو</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-pill bg-ink-border">
          <div className="h-full w-3/4 rounded-pill bg-accent" />
        </div>
      </div>
    </div>
  );
}

type BusinessTourKey = 'manage' | 'book' | 'grow';

const BUSINESS_TOUR: Record<
  BusinessTourKey,
  {
    icon: IconComponent;
    label: string;
    title: string;
    body: string;
    bullets: string[];
  }
> = {
  manage: {
    icon: LayoutDashboard,
    label: 'مدیریت کن',
    title: 'روز سالن را از یک تقویم آرام اداره کنید.',
    body: 'نوبت‌ها، اعضای تیم، زمان‌های آزاد و اطلاعات مشتری در یک نمای قابل فهم کنار هم قرار می‌گیرند.',
    bullets: ['تقویم روز و هفته', 'پرونده و یادداشت مشتری', 'یادآوری و قانون لغو'],
  },
  book: {
    icon: CalendarDays,
    label: 'رزرو بگیر',
    title: 'مشتری خودش زمان مناسب را پیدا کند.',
    body: 'یک صفحهٔ رزرو فارسی برای بیو، استوری، پیام و QR؛ بدون نصب اپ برای مشتری.',
    bullets: ['خدمت و زمان واقعی', 'تأیید سریع نوبت', 'لینک اختصاصی سالن'],
  },
  grow: {
    icon: WandSparkles,
    label: 'رشد بده',
    title: 'هر ورودی را به رابطهٔ بعدی تبدیل کنید.',
    body: 'کانال‌های ورودی و مسیر معرفی سالن را شفاف کنید تا بدانید مشتری از کجا آمده و چه زمانی برمی‌گردد.',
    bullets: ['بیو، استوری و QR', 'لینک معرفی مشتری', 'یادآوری مراجعهٔ بعدی'],
  },
};

function BusinessFeatureTour() {
  const [active, setActive] = useState<BusinessTourKey>('manage');
  const current = BUSINESS_TOUR[active];
  const CurrentIcon = current.icon;

  return (
    <div className="mt-10 overflow-hidden rounded-[1.75rem] border border-border bg-elevated shadow-2">
      <div
        className="grid border-b border-border md:grid-cols-3"
        role="tablist"
        aria-label="بخش‌های آرا"
      >
        {(Object.keys(BUSINESS_TOUR) as BusinessTourKey[]).map((key) => {
          const item = BUSINESS_TOUR[key];
          const Icon = item.icon;
          const selected = active === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="business-feature-panel"
              onClick={() => setActive(key)}
              className={cn(
                'flex min-h-16 items-center gap-3 border-b border-border px-5 py-4 text-start transition-colors last:border-b-0 md:border-b-0 md:border-s first:md:border-s-0',
                'outline-none focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-[-2px]',
                selected ? 'bg-primary text-primary-contrast' : 'text-text hover:bg-surface',
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-2xs opacity-75">
                  ۰{key === 'manage' ? '۱' : key === 'book' ? '۲' : '۳'}
                </span>
                <span className="mt-1 block font-bold">{item.label}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div
        id="business-feature-panel"
        role="tabpanel"
        className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center"
      >
        <div>
          <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <CurrentIcon className="size-5" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-2xl text-display">{current.title}</h3>
          <p className="mt-4 text-sm leading-8 text-muted">{current.body}</p>
          <ul className="mt-6 space-y-3">
            {current.bullets.map((bullet) => (
              <li key={bullet} className="flex items-center gap-2 text-sm font-semibold">
                <Check className="size-4 text-primary" aria-hidden="true" />
                {bullet}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative min-h-[18rem] overflow-hidden rounded-2xl bg-surface p-2 sm:min-h-[24rem]">
          {active === 'manage' ? (
            <DashboardImage className="h-full min-h-[17rem] rounded-xl object-cover object-top sm:min-h-[22rem]" />
          ) : active === 'book' ? (
            <div className="flex h-full min-h-[17rem] items-center justify-center rounded-xl bg-ink p-4 sm:min-h-[22rem]">
              <BookingImage className="h-[21rem] w-auto rounded-xl shadow-2 sm:h-[27rem]" />
            </div>
          ) : (
            <GrowthBoardMock />
          )}
          <span className="absolute bottom-5 start-5 rounded-pill bg-ink/80 px-3 py-1.5 text-2xs font-semibold text-ink-contrast backdrop-blur-sm">
            نمای نمونهٔ محصول
          </span>
        </div>
      </div>
    </div>
  );
}

function ReferralFlow() {
  const steps = [
    { icon: Send, label: 'دعوت', body: 'مشتری لینک سالن محبوبش را می‌فرستد.' },
    { icon: PanelTop, label: 'ثبت سالن', body: 'صاحب سالن با همان لینک وارد شروع می‌شود.' },
    {
      icon: CalendarDays,
      label: 'رزرو واقعی',
      body: 'خدمت و زمان در صفحهٔ فارسی سالن قرار می‌گیرد.',
    },
    {
      icon: CircleDollarSign,
      label: 'پاداش کمپین',
      body: 'پس از شرط روشن کمپین، پاداش یا پوشش اعمال می‌شود.',
    },
  ];

  return (
    <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map(({ icon: Icon, label, body }, index) => (
        <div key={label} className="relative rounded-2xl border border-ink-border bg-ink/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/20 text-accent">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="text-xs font-bold text-ink-muted">۰{index + 1}</span>
          </div>
          <h3 className="mt-6 font-bold">{label}</h3>
          <p className="mt-2 text-sm leading-7 text-ink-muted">{body}</p>
        </div>
      ))}
    </div>
  );
}

/** Main owner-first landing: Fresha-inspired hierarchy, localized for Iran and Ara's referral loop. */
function BusinessInspiredVariant() {
  return (
    <>
      <section data-hero className="relative overflow-hidden bg-surface">
        <div className="absolute inset-x-0 top-0 h-1 bg-primary" aria-hidden="true" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-12 sm:py-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:py-20">
          <div className="motion-safe:animate-fade-up">
            <p className="mb-6 flex items-center gap-3 text-xs font-bold tracking-wider text-primary">
              <span className="h-px w-10 bg-primary" aria-hidden="true" />
              نرم‌افزار سالن برای بازار ایران
            </p>
            <h1 className="max-w-xl text-4xl font-display leading-tight tracking-tight sm:text-6xl">
              سالن شما، <span className="text-primary">یک قدم جلوتر.</span>
            </h1>
            <p className="mt-6 max-w-xl text-md leading-8 text-muted sm:text-lg">
              آرا تقویم، صفحهٔ رزرو، مشتری‌ها و مسیر معرفی را در یک فضای فارسی جمع می‌کند؛ تا شما
              به‌جای جواب‌دادن به پیام‌های تکراری، روی تجربهٔ سالن تمرکز کنید.
            </p>
            <HeroActions primaryLabel="رایگان شروع کنید" />
            <div className="mt-7">
              <TrustRail items={['بدون نصب برای مشتری', 'لینک بیو و QR', 'پشتیبانی فارسی']} />
            </div>
          </div>
          <BusinessHeroScene />
        </div>
        <div className="border-t border-border bg-elevated">
          <div className="mx-auto grid max-w-7xl divide-y divide-border px-4 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            {[
              { icon: CalendarDays, label: 'ادارهٔ روز سالن', body: 'تقویم و تیم' },
              { icon: Link2, label: 'رزرو ۲۴ ساعته', body: 'لینک اختصاصی سالن' },
              { icon: QrCode, label: 'ورودی از همه‌جا', body: 'بیو، استوری و QR' },
              { icon: RefreshCw, label: 'مراجعهٔ بعدی', body: 'یادآوری و پیگیری' },
            ].map(({ icon: Icon, label, body }) => (
              <div key={label} className="flex items-center gap-3 py-4 sm:px-5 lg:first:pe-0">
                <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold">{label}</p>
                  <p className="mt-1 text-2xs text-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="why" className="scroll-mt-20 bg-ink py-16 text-ink-contrast sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader
            dark
            eyebrow="یک پلتفرم، سه کار اصلی"
            title="هر چیزی که صاحب سالن برای رشد لازم دارد، در یک مسیر"
            body="ساختار صفحه مثل بهترین نرم‌افزارهای سالن است؛ اما زبان، مسیر شروع و دغدغه‌هایش برای سالن‌دار ایرانی طراحی شده است."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: LayoutDashboard,
                title: 'مدیریت کن',
                body: 'تقویم، خدمات، اعضای تیم و پروندهٔ مشتری را بدون پراکندگی اداره کنید.',
              },
              {
                icon: MousePointer2,
                title: 'رزرو بگیر',
                body: 'مشتری از لینک بیو، QR یا پیام مستقیم وارد صفحهٔ رزرو فارسی شود.',
              },
              {
                icon: WandSparkles,
                title: 'رشد بده',
                body: 'مسیر معرفی و مراجعهٔ بعدی را بسازید؛ نه فقط یک تقویم خالی.',
              },
            ].map(({ icon: Icon, title, body }, index) => (
              <article key={title} className="rounded-2xl border border-ink-border bg-ink/70 p-6">
                <div className="flex items-center justify-between gap-4">
                  <Icon className="size-6 text-accent" aria-hidden="true" />
                  <span className="text-xs text-ink-muted">۰{index + 1}</span>
                </div>
                <h3 className="mt-8 text-lg font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-ink-muted">{body}</p>
              </article>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-2 text-xs text-ink-muted">
            {['سالن زیبایی', 'آرایشگر مستقل', 'میکاپ آرتیست', 'سالن چندنفره', 'خدمات عروس'].map(
              (item) => (
                <span key={item} className="rounded-pill border border-ink-border px-3 py-2">
                  {item}
                </span>
              ),
            )}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader
            eyebrow="داخل آرا چه می‌بینید؟"
            title="از یک تقویم شروع کنید؛ به یک سیستم کامل برسید"
            body="سه بخش اصلی را لمس کنید و ببینید هرکدام چه مشکلی از روز سالن حل می‌کند."
          />
          <BusinessFeatureTour />
          <div className="mt-6 flex flex-wrap gap-2">
            {[
              'تقویم تیمی',
              'رزرو آنلاین',
              'پروندهٔ مشتری',
              'یادآوری',
              'QR اختصاصی',
              'گزارش ظرفیت',
              'معرفی مشتری',
            ].map((item) => (
              <span
                key={item}
                className="rounded-pill border border-border bg-surface px-3 py-2 text-xs font-semibold text-muted"
              >
                <Check className="me-1 inline-block size-3.5 text-primary" aria-hidden="true" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section
        id="solutions"
        className="scroll-mt-20 overflow-hidden bg-primary py-16 text-primary-contrast sm:py-20"
      >
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <SectionHeader
              dark
              eyebrow="ایدهٔ معرفی شما، داخل محصول"
              title="مشتری‌ها سالن محبوبشان را وارد آرا می‌کنند"
              body="این مسیر برای کمپین اینستاگرامی شماست: مشتری لینک را می‌فرستد، سالن وارد می‌شود و بعد از تکمیل شرط‌های شفاف، پاداش یا پوشش اشتراک اعمال می‌شود."
            />
            <ReferralFlow />
            <p className="mt-6 flex items-start gap-2 text-xs leading-6 text-primary-contrast/80">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              شرایط، سقف و زمان پاداش را قبل از انتشار هر کمپین به‌وضوح اعلام کنید.
            </p>
          </div>
          <figure className="mx-auto w-full max-w-xs rounded-[2rem] border border-primary-contrast/20 bg-ink p-2 shadow-3">
            <BookingImage className="rounded-[1.5rem]" />
            <figcaption className="px-2 py-3 text-center text-xs text-ink-muted">
              مقصد نهایی لینک؛ رزرو ساده برای مشتری
            </figcaption>
          </figure>
        </div>
      </section>

      <section
        id="pricing"
        className="scroll-mt-20 border-b border-border bg-surface py-16 sm:py-20"
      >
        <div className="mx-auto grid max-w-7xl gap-8 px-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <SectionHeader
            eyebrow="تصمیم شفاف"
            title="اول ارزش را ببینید، بعد هزینه را انتخاب کنید"
            body="شروع آزمایشی رایگان است؛ تعرفهٔ اشتراک و شرایط هر کمپین پیش از پرداخت یا انتشار، داخل مسیر شما روشن می‌شود."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-elevated p-6 shadow-1">
              <div className="flex items-center gap-3">
                <Zap className="size-5 text-primary" aria-hidden="true" />
                <p className="font-bold">شروع برای سالن</p>
              </div>
              <p className="mt-5 text-2xl text-display">رایگان شروع کنید</p>
              <ul className="mt-5 space-y-3 text-sm text-muted">
                {['بدون کارت بانکی', 'ساخت صفحهٔ رزرو', 'پشتیبانی فارسی'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="size-4 text-primary" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-ink bg-ink p-6 text-ink-contrast shadow-1">
              <div className="flex items-center gap-3">
                <Users className="size-5 text-accent" aria-hidden="true" />
                <p className="font-bold">کمپین معرفی</p>
              </div>
              <p className="mt-5 text-lg font-bold">برای هر دعوت، مسیر روشن</p>
              <p className="mt-3 text-sm leading-7 text-ink-muted">
                لینک دعوت، وضعیت رزرو و شرط پاداش را کنار هم ببینید؛ بدون وعدهٔ مبهم برای سالن یا
                مشتری.
              </p>
            </div>
          </div>
        </div>
      </section>

      <FinalCta
        title="سالن را به یک سیستم آرام تبدیل کنید"
        body="صفحهٔ سالن را بسازید، لینک را در بیو بگذارید و اولین رزرو آنلاین را از یک مسیر کوتاه بگیرید."
      />
    </>
  );
}

/** Concept 01 — the day as a calm, operational timeline. */
function DayPlannerVariant() {
  return (
    <>
      <section data-hero className="relative overflow-hidden bg-ink text-ink-contrast">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-12 sm:py-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:py-20">
          <div className="motion-safe:animate-fade-up">
            <p className="mb-6 flex items-center gap-3 text-xs font-bold tracking-wider text-accent">
              <span className="h-px w-10 bg-accent" aria-hidden="true" />
              مدیر روز سالن
            </p>
            <h1 className="max-w-xl text-4xl font-display leading-tight tracking-tight sm:text-6xl">
              هر ساعت سالن، یک تصمیم کمتر.
            </h1>
            <p className="mt-6 max-w-xl text-md leading-8 text-ink-muted">
              آرا روز کاری شما را از دل پیام‌ها بیرون می‌کشد: چه کسی می‌آید، کدام صندلی خالی است و
              مشتری بعدی از کجا وارد می‌شود.
            </p>
            <HeroActions primaryLabel="روز سالن را آماده کنید" />
            <div className="mt-7">
              <TrustRail dark />
            </div>
          </div>
          <figure className="relative mx-auto w-full max-w-2xl">
            <div className="absolute -end-4 -top-8 h-32 w-44 overflow-hidden rounded-2xl border border-ink-border opacity-60 sm:-end-8">
              <OwnerImage loading="eager" />
            </div>
            <div className="relative pt-8">
              <DayTimeline />
              <div className="absolute -bottom-8 start-4 w-[38%] overflow-hidden rounded-xl border-4 border-ink bg-elevated shadow-3 sm:start-10">
                <BookingImage className="rounded-lg" />
              </div>
            </div>
            <figcaption className="sr-only">
              تقویم روزانهٔ سالن و نمای رزرو موبایلی مشتری در آرا.
            </figcaption>
          </figure>
        </div>
        <div className="mx-auto grid max-w-7xl border-t border-ink-border px-4 sm:grid-cols-3">
          {[
            'نوبت‌ها یک‌جا دیده می‌شوند',
            'جای خالی به چشم می‌آید',
            'رزرو بدون تماس انجام می‌شود',
          ].map((item) => (
            <p
              key={item}
              className="border-ink-border py-5 text-sm text-ink-muted sm:px-5 sm:first:pe-0 sm:not-first:border-s"
            >
              {item}
            </p>
          ))}
        </div>
      </section>

      <section id="why" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader
            eyebrow="یک نگاه برای یک روز"
            title="از اولین نوبت تا آخرین مشتری"
            body="آرا برای لحظه‌ای ساخته شده که سالن شلوغ است و شما وقت ندارید بین چند پیام و دفتر و تقویم بگردید."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: CalendarDays,
                title: 'تقویم تیمی',
                body: 'برنامهٔ تیم و صندلی‌ها را کنار هم ببینید.',
              },
              {
                icon: MessageCircle,
                title: 'پیام کمتر',
                body: 'مشتری خودش خدمت و ساعت خالی را انتخاب کند.',
              },
              {
                icon: RefreshCw,
                title: 'بازگشت بیشتر',
                body: 'سابقه و یادآوری، مراجعهٔ بعدی را جلو می‌اندازد.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <article
                key={title}
                className="rounded-lg border border-border bg-elevated p-6 shadow-1"
              >
                <Icon className="size-6 text-primary" aria-hidden="true" />
                <h3 className="mt-6 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 overflow-hidden bg-surface py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <figure className="overflow-hidden rounded-2xl border border-border bg-elevated p-2 shadow-3">
            <DashboardImage className="rounded-lg" />
            <figcaption className="px-2 py-3 text-xs text-muted">
              تقویم واقعی آرا؛ ساده برای روزهای شلوغ
            </figcaption>
          </figure>
          <div>
            <SectionHeader
              eyebrow="داخل محصول"
              title="هر چیزی سر جای خودش"
              body="تقویم، صفحهٔ رزرو، پروندهٔ مشتری و گزارش را کم‌کم اضافه کنید؛ شروع فقط با روز کاری شماست."
            />
            <div className="mt-8">
              <FeatureRows
                items={[
                  {
                    icon: LayoutDashboard,
                    title: 'نمای روز و هفته',
                    body: 'زمان خالی و نوبت‌ها را بدون جدول‌های گیج‌کننده ببینید.',
                  },
                  {
                    icon: Link2,
                    title: 'لینک رزرو سالن',
                    body: 'همان لینکی که در بیو و پیام برای مشتری می‌فرستید.',
                  },
                  {
                    icon: ShieldCheck,
                    title: 'قانون برای زمان شما',
                    body: 'یادآوری، لغو و بیعانه را مطابق مدل سالن تنظیم کنید.',
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </section>

      <section id="solutions" className="scroll-mt-20 bg-ink py-16 text-ink-contrast sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader
            dark
            eyebrow="شروع آرام"
            title="سه حرکت برای سالن آنلاین"
            body="پروفایل را بسازید، لینک را منتشر کنید، بعد فقط روزتان را مدیریت کنید."
          />
          <div className="mt-10">
            <NumberedSteps
              dark
              items={[
                'نام سالن، خدمات و ساعت کاری را وارد کنید.',
                'لینک رزرو را در بیو، استوری یا QR بگذارید.',
                'رزروهای جدید را در تقویم و سابقهٔ مشتری ببینید.',
              ]}
            />
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-20 border-b border-border py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <SectionHeader
            eyebrow="تصمیم بدون ریسک"
            title="اول روزتان را ببینید، بعد انتخاب کنید"
            body="شروع آزمایشی رایگان است؛ تعرفهٔ اشتراک پیش از هر پرداخت داخل پنل نمایش داده می‌شود."
          />
          <Link to="/business/register" className={primaryCtaClass}>
            روز سالن را بسازید <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </Link>
        </div>
      </section>
      <FinalCta
        title="فردا را از امشب مرتب کنید"
        body="تقویم سالن را بسازید و اولین نوبت آنلاین را بدون تماس اضافه بگیرید."
      />
    </>
  );
}

function SalonCardMock() {
  return (
    <div className="relative mx-auto max-w-md">
      <div
        className="absolute -inset-4 rotate-[-4deg] rounded-2xl border border-primary/10 bg-primary/5"
        aria-hidden="true"
      />
      <div className="relative rotate-[2deg] overflow-hidden rounded-2xl border border-border bg-elevated p-5 shadow-3">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <p className="text-2xs font-bold tracking-widest text-primary">ARA / SALON PROFILE</p>
            <h2 className="mt-2 text-2xl font-display">سالن رز</h2>
            <p className="mt-1 text-xs text-muted">رنگ، کوتاهی و میکاپ</p>
          </div>
          <div
            className="grid size-14 grid-cols-5 gap-0.5 rounded-md bg-ink p-1"
            aria-label="کد QR صفحهٔ رزرو"
          >
            {Array.from({ length: 25 }, (_, index) => (
              <span
                key={index}
                className={cn(
                  'rounded-[1px]',
                  [0, 1, 4, 5, 9, 15, 19, 20, 21, 24].includes(index)
                    ? 'bg-primary-contrast'
                    : 'bg-primary',
                )}
              />
            ))}
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-xl bg-ink">
          <div className="h-36">
            <OwnerImage className="object-[center_35%] opacity-80" />
          </div>
          <div className="flex items-center justify-between px-4 py-4 text-ink-contrast">
            <div>
              <p className="text-xs text-ink-muted">اولین زمان آزاد</p>
              <p className="mt-1 font-bold">امروز، ۱۳:۰۰</p>
            </div>
            <span className="rounded-pill bg-accent px-3 py-1.5 text-xs font-bold text-ink">
              رزرو
            </span>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-muted">ara.ir/rose — برای اشتراک‌گذاری آماده</p>
      </div>
    </div>
  );
}

/** Concept 02 — treat the salon's booking page as a living business card. */
function SalonCardVariant() {
  return (
    <>
      <section data-hero className="relative overflow-hidden bg-warning/10">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-12 sm:py-16 lg:grid-cols-[1fr_0.9fr] lg:gap-20 lg:py-20">
          <div className="order-1 motion-safe:animate-fade-up lg:order-1">
            <p className="mb-6 flex items-center gap-3 text-xs font-bold tracking-wider text-primary">
              <span className="h-px w-10 bg-primary" aria-hidden="true" />
              کارت ویزیت زندهٔ سالن
            </p>
            <h1 className="max-w-xl text-4xl font-display leading-tight tracking-tight sm:text-6xl">
              فقط یک لینک. کل سالن شما.
            </h1>
            <p className="mt-6 max-w-xl text-md leading-8 text-muted">
              به‌جای توضیح‌دادن در هر پیام، یک صفحهٔ تمیز با نام، خدمات، قیمت و زمان‌های آزاد داشته
              باشید.
            </p>
            <HeroActions primaryLabel="کارت زندهٔ سالن را بسازید" />
            <div className="mt-7">
              <TrustRail items={['لینک قابل کپی', 'QR قابل چاپ', 'بدون ورود مشتری']} />
            </div>
          </div>
          <figure className="order-2 lg:order-2">
            <SalonCardMock />
            <figcaption className="sr-only">نمونه کارت ویزیت زنده و صفحهٔ رزرو سالن.</figcaption>
          </figure>
        </div>
      </section>

      <section id="why" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader
            eyebrow="مشتری چه می‌بیند؟"
            title="اول حس سالن، بعد انتخاب نوبت"
            body="صفحهٔ عمومی آرا یک فرم خشک نیست؛ یک ورودی کوچک و شفاف به کسب‌وکار شماست."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Scissors,
                title: 'خدمات واضح',
                body: 'مشتری دقیق می‌داند چه چیزی را انتخاب می‌کند.',
              },
              {
                icon: CircleDollarSign,
                title: 'قیمت روشن',
                body: 'قیمت و توضیح خدمت کنار هم دیده می‌شوند.',
              },
              {
                icon: Clock3,
                title: 'زمان واقعی',
                body: 'فقط ساعت‌هایی نمایش داده می‌شوند که واقعاً آزادند.',
              },
              {
                icon: QrCode,
                title: 'همه‌جا قابل پخش',
                body: 'بیو، کارت، آینه و پیام؛ یک مقصد ثابت.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <article
                key={title}
                className="rounded-2xl border border-border bg-elevated p-5 shadow-1"
              >
                <Icon className="size-6 text-primary" aria-hidden="true" />
                <h3 className="mt-6 font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="features"
        className="scroll-mt-20 border-y border-border bg-surface py-16 sm:py-20"
      >
        <div className="mx-auto grid max-w-7xl gap-12 px-4 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
          <div>
            <SectionHeader
              eyebrow="هویت سالن داخل محصول"
              title="هر سالن، صفحهٔ خودش را دارد"
              body="نام و حال‌وهوای سالن شما، قبل از اینکه مشتری وارد تقویم شود دیده می‌شود."
            />
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {['نام و معرفی سالن', 'خدمات و قیمت‌ها', 'لینک مستقیم رزرو', 'محدودیت‌های کاری'].map(
                (item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-md border border-border bg-elevated p-3 text-sm font-semibold"
                  >
                    <Check className="size-4 text-primary" aria-hidden="true" />
                    {item}
                  </div>
                ),
              )}
            </div>
          </div>
          <figure className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-elevated p-3 shadow-3">
            <div className="flex gap-4">
              <div className="w-2/3 overflow-hidden rounded-xl bg-bg">
                <OwnerImage className="h-44 object-[center_35%]" />
                <div className="grid gap-2 p-3 sm:grid-cols-2">
                  {['کوتاهی', 'رنگ', 'میکاپ', 'ناخن'].map((item) => (
                    <div key={item} className="rounded-md border border-border px-3 py-2 text-xs">
                      {item}
                      <span className="float-end text-primary">انتخاب</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="w-1/3 overflow-hidden rounded-xl border border-border bg-bg p-2">
                <BookingImage />
              </div>
            </div>
            <figcaption className="px-2 pt-4 text-xs text-muted">
              نمونهٔ صفحهٔ عمومی سالن برای مشتری
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="solutions" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader eyebrow="پخش‌کردن آسان" title="صفحه‌تان را هرجا مشتری هست بگذارید" />
          <div className="mt-10">
            <NumberedSteps
              items={[
                'لینک سالن را کپی کنید و در بیوی اینستاگرام بگذارید.',
                'QR صفحه را روی کارت یا آینهٔ سالن چاپ کنید.',
                'هر رزرو را در تقویم خودکار و مرتب تحویل بگیرید.',
              ]}
            />
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-20 bg-ink py-16 text-ink-contrast sm:py-20">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader
            dark
            eyebrow="شروع سبک"
            title="قبل از پرداخت، کارت سالن را ببینید"
            body="پروفایل را بسازید، لینک را امتحان کنید و بعد تصمیم بگیرید."
          />
          <Link
            to="/business/register"
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-6 font-bold text-ink no-underline"
          >
            ساخت کارت سالن <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </Link>
        </div>
      </section>
      <FinalCta
        title="سالن شما یک آدرس تازه دارد"
        body="یک لینک ساده بسازید که مشتری را مستقیم به انتخاب خدمت و زمان برساند."
      />
    </>
  );
}

function Heatmap() {
  const rows = ['ش', 'ی', 'د', 'س', 'چ', 'پ'];
  const colors = [
    'bg-primary/10',
    'bg-primary/30',
    'bg-primary/60',
    'bg-primary',
    'bg-warning/50',
    'bg-primary/20',
  ];
  return (
    <div className="rounded-2xl border border-border bg-elevated p-5 shadow-3 sm:p-7">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted">ظرفیت این هفته</p>
          <p className="mt-1 text-xl font-bold">نقشهٔ صندلی‌ها</p>
        </div>
        <BarChart3 className="size-6 text-primary" aria-hidden="true" />
      </div>
      <div className="mt-6 grid grid-cols-[1.5rem_repeat(6,1fr)] gap-2 text-center text-2xs">
        <span />
        {['۹', '۱۱', '۱۳', '۱۵', '۱۷', '۱۹'].map((hour) => (
          <span key={hour} className="text-muted">
            {hour}
          </span>
        ))}
        {rows.map((day, row) => (
          <div key={day} className="contents">
            <span className="self-center text-muted">{day}</span>
            {colors.map((color, column) => (
              <span
                key={column}
                className={cn(
                  'aspect-square rounded-md border border-border',
                  color,
                  column === (row + 2) % 6 && 'ring-2 ring-primary/40',
                )}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between text-xs">
        <span className="text-muted">تیره‌تر یعنی رزرو بیشتر</span>
        <span className="font-bold text-primary">۴ جای خالی قابل پیگیری</span>
      </div>
    </div>
  );
}

/** Concept 03 — show business capacity as a visual map, not a dashboard. */
function HeatmapVariant() {
  return (
    <>
      <section data-hero className="relative overflow-hidden border-b border-border bg-surface">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-12 sm:py-16 lg:grid-cols-[1fr_1.05fr] lg:gap-20 lg:py-20">
          <div className="motion-safe:animate-fade-up">
            <p className="mb-6 flex items-center gap-3 text-xs font-bold tracking-wider text-primary">
              <span className="h-px w-10 bg-primary" aria-hidden="true" />
              نقشهٔ ظرفیت سالن
            </p>
            <h1 className="max-w-xl text-4xl font-display leading-tight tracking-tight sm:text-6xl">
              جای خالی را قبل از مشتری پیدا کن.
            </h1>
            <p className="mt-6 max-w-xl text-md leading-8 text-muted">
              به‌جای حدس‌زدن، هفتهٔ سالن را مثل یک نقشه ببینید: کجا پُر است، کجا فرصت است و کدام
              خدمت باید بیشتر دیده شود.
            </p>
            <HeroActions primaryLabel="نقشهٔ سالن را بسازید" />
            <div className="mt-7">
              <TrustRail items={['تقویم قابل فهم', 'گزارش ظرفیت', 'آزمایشی رایگان']} />
            </div>
          </div>
          <figure className="relative">
            <Heatmap />
            <div className="absolute -bottom-8 start-6 h-28 w-24 overflow-hidden rounded-xl border-4 border-surface shadow-2">
              <OwnerImage />
            </div>
            <figcaption className="sr-only">نقشهٔ بصری ظرفیت و زمان‌های خالی سالن.</figcaption>
          </figure>
        </div>
      </section>

      <section id="why" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader
            eyebrow="عددهایی که به کار می‌آیند"
            title="سه چیز را هر صبح بدانید"
            body="نه نمودارهای تزئینی؛ فقط اطلاعاتی که روی صندلی، زمان و پول سالن اثر دارند."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { icon: Timer, title: 'زمان آزاد', body: 'کدام ساعت‌ها هنوز قابل فروش‌اند؟' },
              { icon: Users, title: 'تقاضا', body: 'کدام خدمت و بازه بیشتر دیده می‌شود؟' },
              {
                icon: CircleDollarSign,
                title: 'ظرفیت',
                body: 'ارزش زمان‌های استفاده‌نشده چقدر است؟',
              },
            ].map(({ icon: Icon, title, body }) => (
              <article key={title} className="border-t-2 border-primary bg-elevated p-6 shadow-1">
                <Icon className="size-6 text-primary" aria-hidden="true" />
                <h3 className="mt-6 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="features"
        className="scroll-mt-20 overflow-hidden bg-ink py-16 text-ink-contrast sm:py-20"
      >
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <SectionHeader
              dark
              eyebrow="از نقشه تا عمل"
              title="هر جای خالی، یک اقدام دارد"
              body="لینک رزرو را منتشر کنید، ساعت را جابه‌جا کنید یا برای خدمت مشخص یک کمپین کوچک بسازید."
            />
            <div className="mt-8">
              <FeatureRows
                dark
                items={[
                  {
                    icon: Link2,
                    title: 'لینک برای ساعت خالی',
                    body: 'مشتری بدون تماس زمان را انتخاب می‌کند.',
                  },
                  {
                    icon: MessageCircle,
                    title: 'پیام آماده',
                    body: 'جای خالی امروز را با یک متن کوتاه پخش کنید.',
                  },
                  {
                    icon: BarChart3,
                    title: 'دیدن نتیجه',
                    body: 'بدانید کدام مسیر واقعاً رزرو ساخته است.',
                  },
                ]}
              />
            </div>
          </div>
          <figure className="overflow-hidden rounded-2xl border border-ink-border bg-elevated p-2 shadow-3">
            <DashboardImage className="rounded-lg" />
            <figcaption className="px-2 py-3 text-xs text-muted">تقویم و ظرفیت، کنار هم</figcaption>
          </figure>
        </div>
      </section>

      <section id="solutions" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader eyebrow="از فردا صبح" title="ظرفیت را به تصمیم تبدیل کنید" />
          <div className="mt-10">
            <NumberedSteps
              items={[
                'خدمات و ساعت‌های کاری را وارد کنید.',
                'نقشهٔ هفته را ببینید و جای خالی را انتخاب کنید.',
                'لینک همان زمان را برای مشتری‌ها منتشر کنید.',
              ]}
            />
          </div>
        </div>
      </section>

      <section
        id="pricing"
        className="scroll-mt-20 border-t border-border bg-warning/10 py-16 sm:py-20"
      >
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <SectionHeader
            eyebrow="حساب‌وکتاب ساده"
            title="عدد را ببینید؛ بعد انتخاب کنید"
            body="آزمایشی رایگان و تعرفهٔ شفاف، پیش از هر پرداخت."
          />
          <Link to="/business/register" className={primaryCtaClass}>
            دیدن ظرفیت سالن <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </Link>
        </div>
      </section>
      <FinalCta
        title="هیچ ساعت خوبی نباید ناپدید شود"
        body="ظرفیت سالن را روی نقشه بیاورید و از همان‌جا برایش اقدام کنید."
      />
    </>
  );
}

function CommandPanel() {
  const commands = [
    ['رزرو جدید', 'مشتری: سارا / خدمت: رنگ', 'bg-primary/10'],
    ['یادآوری امروز', '۳ مشتری تا نوبت فاصله دارند', 'bg-warning/15'],
    ['جای خالی', 'امروز ۱۳:۰۰ / صندلی ۲', 'bg-accent/15'],
  ];
  return (
    <div className="rounded-2xl border border-ink-border bg-ink p-4 text-ink-contrast shadow-3 sm:p-6">
      <div className="flex items-center gap-2 border-b border-ink-border pb-4">
        <span className="size-2 rounded-full bg-danger" />
        <span className="size-2 rounded-full bg-warning" />
        <span className="size-2 rounded-full bg-accent" />
        <span className="ms-auto text-2xs text-ink-muted">ara / command</span>
      </div>
      <div className="mt-5 rounded-md border border-ink-border bg-surface/5 px-4 py-3 text-sm">
        <span className="text-accent">⌘</span>
        <span className="ms-2 text-ink-muted">چه کاری می‌خواهید انجام دهید؟</span>
      </div>
      <div className="mt-4 space-y-2">
        {commands.map(([title, body, color]) => (
          <div
            key={title}
            className={cn(
              'flex items-center gap-3 rounded-md border border-ink-border px-3 py-3',
              color,
            )}
          >
            <span className="flex size-8 items-center justify-center rounded-md bg-ink text-accent">
              <Zap className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold">{title}</p>
              <p className="mt-1 text-2xs text-ink-muted">{body}</p>
            </div>
            <ArrowLeft
              className="ms-auto size-4 text-ink-muted rtl:-scale-x-100"
              aria-hidden="true"
            />
          </div>
        ))}
      </div>
      <p className="mt-5 text-center text-2xs text-ink-muted">کمتر بگردید؛ بیشتر اداره کنید.</p>
    </div>
  );
}

/** Concept 04 — a keyboard-first control room for busy owners. */
function CommandVariant() {
  return (
    <>
      <section data-hero className="relative overflow-hidden bg-ink text-ink-contrast">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-12 sm:py-16 lg:grid-cols-[1fr_0.95fr] lg:gap-20 lg:py-20">
          <div className="motion-safe:animate-fade-up">
            <p className="mb-6 flex items-center gap-3 text-xs font-bold tracking-wider text-accent">
              <span className="h-px w-10 bg-accent" aria-hidden="true" />
              اتاق فرمان سالن
            </p>
            <h1 className="max-w-xl text-4xl font-display leading-tight tracking-tight sm:text-6xl">
              سالن را اداره کن؛ دنبال کارها نگرد.
            </h1>
            <p className="mt-6 max-w-xl text-md leading-8 text-ink-muted">
              وقتی دست‌ها مشغول کارند، پنل باید سریع باشد. آرا کارهای مهم سالن را کوتاه، قابل دیدن و
              قابل انجام می‌کند.
            </p>
            <HeroActions primaryLabel="اتاق فرمان را باز کنید" />
            <div className="mt-7">
              <TrustRail dark items={['تقویم یک‌جا', 'کارهای روزانه', 'تمرکز روی مشتری']} />
            </div>
          </div>
          <figure>
            <CommandPanel />
            <figcaption className="sr-only">
              نمونهٔ اتاق فرمان سریع آرا برای مدیریت سالن.
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="why" className="scroll-mt-20 border-b border-border py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader
            eyebrow="کارهای واقعی صاحب سالن"
            title="پنل باید جواب بدهد، نه سؤال جدید بسازد"
            body="آرا را با اقدام‌هایی می‌شناسید که هر روز به آن‌ها نیاز دارید؛ نه با فهرست بلند قابلیت‌ها."
          />
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: CalendarDays, title: 'امروز چه خبر؟' },
              { icon: Users, title: 'چه کسی برمی‌گردد؟' },
              { icon: WalletCards, title: 'کدام پرداخت؟' },
              { icon: MessageCircle, title: 'کدام پیگیری؟' },
            ].map(({ icon: Icon, title }) => (
              <div
                key={title}
                className="flex items-center gap-3 rounded-lg border border-border p-4"
              >
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <span className="text-sm font-bold">{title}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 bg-surface py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <figure className="order-2 overflow-hidden rounded-2xl border border-border bg-elevated p-2 shadow-3 lg:order-1">
            <DashboardImage className="rounded-lg" />
            <figcaption className="px-2 py-3 text-xs text-muted">
              از اقدام به نمای کامل تقویم
            </figcaption>
          </figure>
          <div className="order-1 lg:order-2">
            <SectionHeader eyebrow="وقتی سرعت مهم است" title="سه مسیر کوتاه برای سه کار تکراری" />
            <div className="mt-8">
              <FeatureRows
                items={[
                  {
                    icon: Plus,
                    title: 'ثبت سریع نوبت',
                    body: 'وقتی مشتری روبه‌رویتان است، نوبت را همان‌جا اضافه کنید.',
                  },
                  {
                    icon: Send,
                    title: 'فرستادن لینک',
                    body: 'یک لینک آماده برای رزرو یا جای خالی امروز.',
                  },
                  {
                    icon: ListChecks,
                    title: 'بستن کار روز',
                    body: 'پیگیری‌های باز و نوبت‌های فردا را یک‌جا ببینید.',
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </section>

      <section id="solutions" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader
            eyebrow="ساختار بدون شلوغی"
            title="برای پنل، راهنمای ۳ مرحله‌ای لازم نیست"
            body="پروفایل را تنظیم کنید؛ بعد هر روز از همان‌جایی ادامه دهید که کارتان مانده است."
          />
          <div className="mt-10">
            <NumberedSteps
              items={[
                'یک‌بار خدمات، اعضای تیم و ساعت کاری را تنظیم کنید.',
                'هر روز از تقویم یا اقدام سریع وارد شوید.',
                'گزارش و سابقه را برای تصمیم بعدی نگه دارید.',
              ]}
            />
          </div>
        </div>
      </section>

      <section
        id="pricing"
        className="scroll-mt-20 border-y border-border bg-surface py-16 sm:py-20"
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader
            eyebrow="ورود سریع"
            title="همین حالا پنل را امتحان کنید"
            body="قبل از اینکه دربارهٔ اشتراک تصمیم بگیرید، محیط مدیریت را ببینید."
          />
          <Link to="/business/register" className={primaryCtaClass}>
            ورود به اتاق فرمان <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </Link>
        </div>
      </section>
      <FinalCta
        dark
        title="کارهای سالن، یک جای قابل اتکا"
        body="از پیام و دفتر و حافظه فاصله بگیرید؛ روز سالن را در آرا اداره کنید."
      />
    </>
  );
}

function BeforeAfter() {
  return (
    <div className="grid overflow-hidden rounded-2xl border border-border shadow-3 sm:grid-cols-2">
      <div className="bg-ink p-6 text-ink-contrast sm:p-8">
        <div className="flex items-center justify-between">
          <span className="rounded-pill bg-danger/15 px-3 py-1 text-xs font-bold text-danger">
            قبل
          </span>
          <MessageCircle className="size-5 text-ink-muted" aria-hidden="true" />
        </div>
        <p className="mt-10 text-5xl font-black tabular-nums">۴۷</p>
        <p className="mt-2 text-sm text-ink-muted">پیامِ بی‌پاسخ</p>
        <div className="mt-8 space-y-2">
          {['سلام وقت رنگ دارید؟', 'قیمت کوتاهی چنده؟', 'برای پنجشنبه جا دارید؟'].map((item) => (
            <div
              key={item}
              className="rounded-md border border-ink-border px-3 py-3 text-xs text-ink-muted"
            >
              {item}
            </div>
          ))}
        </div>
      </div>
      <div className="bg-primary p-6 text-primary-contrast sm:p-8">
        <div className="flex items-center justify-between">
          <span className="rounded-pill bg-primary-contrast/15 px-3 py-1 text-xs font-bold">
            بعد
          </span>
          <CalendarDays className="size-5" aria-hidden="true" />
        </div>
        <p className="mt-10 text-5xl font-black tabular-nums">۳</p>
        <p className="mt-2 text-sm opacity-80">نوبت قطعیِ امروز</p>
        <div className="mt-8 space-y-2">
          {['سارا / رنگ / ۱۳:۰۰', 'مهسا / کوتاهی / ۱۵:۰۰', 'نسترن / میکاپ / ۱۷:۳۰'].map((item) => (
            <div key={item} className="rounded-md bg-primary-contrast/10 px-3 py-3 text-xs">
              {item}
              <Check className="float-end size-4" aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Concept 05 — make the value legible through a before/after transformation. */
function CompareVariant() {
  return (
    <>
      <section data-hero className="relative overflow-hidden bg-bg">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-12 sm:py-16 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20 lg:py-20">
          <div className="motion-safe:animate-fade-up">
            <p className="mb-6 flex items-center gap-3 text-xs font-bold tracking-wider text-primary">
              <span className="h-px w-10 bg-primary" aria-hidden="true" />
              قبل و بعدِ مدیریت سالن
            </p>
            <h1 className="max-w-xl text-4xl font-display leading-tight tracking-tight sm:text-6xl">
              از «وقت دارید؟» تا «نوبت شما ثبت شد.»
            </h1>
            <p className="mt-6 max-w-xl text-md leading-8 text-muted">
              آرا فاصلهٔ بین پیام مشتری و تقویم شما را حذف می‌کند؛ همان چیزی که هر روز وقت سالن را
              می‌گیرد.
            </p>
            <HeroActions primaryLabel="این تغییر را شروع کنید" />
            <div className="mt-7">
              <TrustRail />
            </div>
          </div>
          <figure>
            <BeforeAfter />
            <figcaption className="mt-4 text-center text-xs text-muted">
              نمونهٔ سادهٔ مسیر قبل و بعد؛ عددها نمایشی‌اند.
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="why" className="scroll-mt-20 bg-surface py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader
            eyebrow="مشکل آشناست"
            title="هر پیام، یک مکالمهٔ تازه نیست"
            body="سؤال‌های تکراری را از دوش خودتان بردارید تا انرژی روی تجربهٔ مشتری بماند."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: Phone,
                title: 'تماس‌های تکراری',
                body: 'زمان کاری شما صرف گفتن ساعت و قیمت می‌شود.',
              },
              {
                icon: Copy,
                title: 'دفترهای جدا',
                body: 'یک نوبت در چند جا ثبت می‌شود و خطا بالا می‌رود.',
              },
              {
                icon: Timer,
                title: 'جای خالی پنهان',
                body: 'ساعت‌های خوب می‌گذرند چون کسی آن‌ها را نمی‌بیند.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <article key={title} className="rounded-lg border border-border bg-elevated p-6">
                <Icon className="size-6 text-primary" aria-hidden="true" />
                <h3 className="mt-6 font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionHeader
              eyebrow="تغییر در جریان کار"
              title="رزرو، یک پایان روشن دارد"
              body="مشتری خدمت و زمان را انتخاب می‌کند؛ نوبت مستقیم به تقویم شما می‌رسد و تاریخچه برای بعد می‌ماند."
            />
            <div className="mt-8">
              <FeatureRows
                items={[
                  {
                    icon: MousePointer2,
                    title: 'انتخاب برای مشتری',
                    body: 'مشتری به‌جای پرسیدن، خودش مسیر را کامل می‌کند.',
                  },
                  {
                    icon: CalendarDays,
                    title: 'ورود به تقویم',
                    body: 'رزرو آنلاین و نوبت دستی کنار هم قرار می‌گیرند.',
                  },
                  {
                    icon: RefreshCw,
                    title: 'پیگیری برای برگشت',
                    body: 'سابقهٔ خدمت شروع مکالمهٔ بعدی است.',
                  },
                ]}
              />
            </div>
          </div>
          <figure className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-elevated p-2 shadow-3">
            <BookingImage className="rounded-xl" />
            <figcaption className="px-2 py-3 text-center text-xs text-muted">
              مشتری مسیر را خودش تمام می‌کند
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="solutions" className="scroll-mt-20 bg-ink py-16 text-ink-contrast sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader dark eyebrow="راهِ کوتاه‌تر" title="پیام کمتر، تمرکز بیشتر" />
          <div className="mt-10">
            <NumberedSteps
              dark
              items={[
                'لینک را جای پاسخ تکراری بفرستید.',
                'زمان واقعی را به مشتری نشان دهید.',
                'رزرو قطعی را در تقویم ببینید.',
              ]}
            />
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-20 border-t border-border py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <SectionHeader
            eyebrow="شروع بدون ریسک"
            title="قبل و بعد را در سالن خودتان ببینید"
            body="دورهٔ آزمایشی رایگان؛ بدون کارت بانکی."
          />
          <Link to="/business/register" className={primaryCtaClass}>
            تغییر را شروع کنید <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </Link>
        </div>
      </section>
      <FinalCta
        title="پیام بعدی می‌تواند یک رزرو باشد"
        body="یک مسیر ساده بسازید تا مشتری به‌جای سؤال‌کردن، وقتش را انتخاب کند."
      />
    </>
  );
}

/** Concept 06 — editorial beauty/mirror language for a high-emotion salon owner. */
function MirrorVariant() {
  return (
    <>
      <section data-hero className="relative overflow-hidden bg-warning/10">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-12 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 lg:py-20">
          <figure className="relative order-2 mx-auto w-full max-w-xl lg:order-2">
            <div
              className="absolute inset-4 rounded-[3rem] border border-primary/20"
              aria-hidden="true"
            />
            <div className="relative overflow-hidden rounded-[3rem] border-[10px] border-ink bg-ink p-2 shadow-3">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[2.25rem]">
                <OwnerImage loading="eager" className="object-[center_35%]" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-ink/10" />
                <div className="absolute inset-x-6 bottom-6 text-ink-contrast">
                  <p className="text-xs tracking-widest text-accent">SALON ROSE / ARA</p>
                  <p className="mt-3 text-3xl font-display">آرامش دیده می‌شود.</p>
                  <div className="mt-5 flex items-center justify-between rounded-md border border-ink-border bg-ink/70 p-3 text-xs backdrop-blur">
                    <span>نوبت بعدی</span>
                    <strong className="text-accent">امروز ۱۳:۰۰</strong>
                  </div>
                </div>
              </div>
            </div>
            <figcaption className="sr-only">
              تصویر آینه‌ای از فضای سالن و نوبت بعدی در آرا.
            </figcaption>
          </figure>
          <div className="order-1 motion-safe:animate-fade-up lg:order-1">
            <p className="mb-6 flex items-center gap-3 text-xs font-bold tracking-wider text-primary">
              <span className="h-px w-10 bg-primary" aria-hidden="true" />
              برای سالن‌هایی که حس دارند
            </p>
            <h1 className="max-w-xl text-4xl font-display leading-tight tracking-tight sm:text-6xl">
              پشتِ یک سالن آرام، یک سیستم خوب ایستاده.
            </h1>
            <p className="mt-6 max-w-xl text-md leading-8 text-muted">
              مشتری باید حس خوبی بگیرد؛ شما هم باید بدانید چه کسی، چه زمانی و برای چه خدمتی می‌آید.
            </p>
            <HeroActions primaryLabel="سالن آرام‌تری بسازید" />
            <div className="mt-7">
              <TrustRail items={['ساده برای شما', 'شفاف برای مشتری', 'فارسی و همراه']} />
            </div>
          </div>
        </div>
      </section>

      <section id="why" className="scroll-mt-20 border-b border-border py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader
            eyebrow="آرامش از کجا می‌آید؟"
            title="وقتی هر چیز جای خودش را دارد"
            body="سالن شما قرار نیست شبیه یک نرم‌افزار اداری دیده شود؛ اما باید پشت صحنه، دقیق کار کند."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: CalendarDays,
                title: 'روز مرتب',
                body: 'تقویم به‌اندازهٔ نیاز شما، نه بیشتر.',
              },
              { icon: Star, title: 'تجربهٔ خوب', body: 'مشتری با حس روشن از رزرو خارج می‌شود.' },
              {
                icon: Headphones,
                title: 'همراهی فارسی',
                body: 'برای شروع، تنظیم و سؤال‌های روزمره.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <article key={title} className="border-t border-primary bg-elevated p-6">
                <Icon className="size-6 text-primary" aria-hidden="true" />
                <h3 className="mt-6 font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 bg-surface py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <SectionHeader
              eyebrow="ساده اما کامل"
              title="زیبایی صفحه، از وضوح می‌آید"
              body="خدمت، قیمت، زمان و قوانین سالن در مسیری که مشتری می‌فهمد؛ بدون شلوغی."
            />
            <div className="mt-8">
              <FeatureRows
                items={[
                  { icon: Scissors, title: 'منوی خدمات', body: 'هر خدمت با توضیح و قیمت خودش.' },
                  {
                    icon: CreditCard,
                    title: 'قانون روشن',
                    body: 'بیعانه و لغو را پیش از تأیید نشان دهید.',
                  },
                  {
                    icon: Sparkles,
                    title: 'حس برند',
                    body: 'صفحه‌ای که نام سالن شما را جلو می‌آورد.',
                  },
                ]}
              />
            </div>
          </div>
          <figure className="relative mx-auto w-full max-w-lg">
            <div className="overflow-hidden rounded-2xl border border-border bg-elevated p-3 shadow-3">
              <OwnerImage className="h-52 rounded-xl object-[center_35%]" />
              <div className="grid gap-2 p-3 sm:grid-cols-2">
                {['رنگ و مش', 'کوتاهی', 'میکاپ', 'ناخن'].map((item) => (
                  <div
                    key={item}
                    className="flex items-center justify-between rounded-md border border-border p-3 text-xs"
                  >
                    <span>{item}</span>
                    <span className="text-primary">دیدن زمان</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-8 end-4 w-1/3 overflow-hidden rounded-xl border-4 border-elevated bg-elevated shadow-2">
              <BookingImage className="rounded-lg" />
            </div>
          </figure>
        </div>
      </section>

      <section id="solutions" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader eyebrow="روال ساده" title="از نام سالن تا اولین حس خوب" />
          <div className="mt-10">
            <NumberedSteps
              items={[
                'نام و حال‌وهوای سالن را ثبت کنید.',
                'خدمات و زمان‌های قابل رزرو را بچینید.',
                'لینک را به مشتری‌های خود بدهید.',
              ]}
            />
          </div>
        </div>
      </section>
      <section id="pricing" className="scroll-mt-20 bg-ink py-16 text-ink-contrast sm:py-20">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader
            dark
            eyebrow="شروع بدون فشار"
            title="سالن خودتان را اول ببینید"
            body="آزمایشی رایگان و امکان تکمیل جزئیات بعد از شروع."
          />
          <Link
            to="/business/register"
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-6 font-bold text-ink no-underline"
          >
            ساخت تجربهٔ سالن <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </Link>
        </div>
      </section>
      <FinalCta
        title="پشت صحنه را سبک‌تر کنید"
        body="تجربهٔ خوب مشتری از روز مرتب شما شروع می‌شود."
      />
    </>
  );
}

function CustomerLoop() {
  const steps = [
    { icon: MousePointer2, label: 'اولین کلیک', body: 'مشتری لینک را باز می‌کند.' },
    { icon: CalendarDays, label: 'اولین نوبت', body: 'خدمت و زمان را انتخاب می‌کند.' },
    { icon: Star, label: 'تجربهٔ خوب', body: 'سابقه برای شما می‌ماند.' },
    { icon: RefreshCw, label: 'مراجعهٔ بعدی', body: 'یادآوری، برگشت را ساده می‌کند.' },
  ];
  return (
    <div className="relative mx-auto max-w-xl">
      <div className="absolute inset-8 rounded-full border border-primary/20" aria-hidden="true" />
      <div className="relative grid gap-3 sm:grid-cols-2">
        {steps.map(({ icon: Icon, label, body }, index) => (
          <div
            key={label}
            className={cn(
              'rounded-2xl border border-border bg-elevated p-5 shadow-1',
              index % 2 === 1 && 'translate-y-8',
            )}
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-xs font-bold text-primary">۰{index + 1}</span>
            </div>
            <h3 className="mt-5 font-bold">{label}</h3>
            <p className="mt-2 text-sm leading-7 text-muted">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Concept 07 — sell retention as a loop, not a list of features. */
function LoopVariant() {
  return (
    <>
      <section data-hero className="relative overflow-hidden bg-primary/5">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-12 sm:py-16 lg:grid-cols-[1fr_1.05fr] lg:gap-20 lg:py-20">
          <div className="motion-safe:animate-fade-up">
            <p className="mb-6 flex items-center gap-3 text-xs font-bold tracking-wider text-primary">
              <span className="h-px w-10 bg-primary" aria-hidden="true" />
              چرخهٔ مشتری سالن
            </p>
            <h1 className="max-w-xl text-4xl font-display leading-tight tracking-tight sm:text-6xl">
              نوبت اول، پایان کار نیست.
            </h1>
            <p className="mt-6 max-w-xl text-md leading-8 text-muted">
              آرا کمک می‌کند مشتری از اولین رزرو تا مراجعهٔ بعدی گم نشود؛ سابقه، یادآوری و تجربه در
              یک مسیر.
            </p>
            <HeroActions primaryLabel="چرخهٔ مشتری را بسازید" />
            <div className="mt-7">
              <TrustRail items={['سابقهٔ مشتری', 'یادآوری', 'رزرو دوباره']} />
            </div>
          </div>
          <figure>
            <CustomerLoop />
            <figcaption className="mt-10 text-center text-xs text-muted">
              یک مشتری، یک مسیر قابل پیگیری
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="why" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader
            eyebrow="ارزش هر مشتری"
            title="به‌جای شروع دوباره، ادامه بدهید"
            body="وقتی مشتری برمی‌گردد، شما نباید از صفر شروع کنید؛ آرا سابقه و انتخاب قبلی را نگه می‌دارد."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { icon: Receipt, title: 'سابقهٔ خدمت', body: 'بدانید دفعهٔ قبل چه کاری انجام شده.' },
              { icon: Send, title: 'پیگیری درست', body: 'یادآوری را به‌موقع و کوتاه بفرستید.' },
              {
                icon: RefreshCw,
                title: 'رزرو مجدد',
                body: 'بازگشت مشتری را با یک مسیر ساده جلو ببرید.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <article
                key={title}
                className="rounded-lg border border-border bg-elevated p-6 shadow-1"
              >
                <Icon className="size-6 text-primary" aria-hidden="true" />
                <h3 className="mt-6 font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 bg-surface py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-2 lg:items-center">
          <figure className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-elevated p-2 shadow-3">
            <BookingImage className="rounded-xl" />
            <figcaption className="px-2 py-3 text-center text-xs text-muted">
              رزرو اول روی موبایل
            </figcaption>
          </figure>
          <div>
            <SectionHeader
              eyebrow="از رزرو تا بازگشت"
              title="هر مرحله، یک نشانه برای مرحلهٔ بعد"
              body="آرا فقط تقویم نیست؛ اطلاعات ساده‌ای می‌دهد که مراجعهٔ بعدی را طبیعی‌تر کنید."
            />
            <div className="mt-8">
              <FeatureRows
                items={[
                  {
                    icon: Users,
                    title: 'پروندهٔ مشتری',
                    body: 'نام، شماره، سابقه و یادداشت‌ها در یک‌جا.',
                  },
                  {
                    icon: CalendarDays,
                    title: 'زمان‌بندی دوباره',
                    body: 'مشتری زمان مناسب بعدی را راحت‌تر پیدا می‌کند.',
                  },
                  {
                    icon: Star,
                    title: 'تجربهٔ شخصی‌تر',
                    body: 'بدانید هر مشتری چه چیزی را دوست دارد.',
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </section>

      <section id="solutions" className="scroll-mt-20 border-y border-border py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader eyebrow="فلو ماندگار" title="چهار لحظه، یک رابطه" />
          <div className="mt-10">
            <NumberedSteps
              items={[
                'مشتری از لینک یا QR وارد می‌شود.',
                'خدمت و زمان مناسب را انتخاب می‌کند.',
                'سابقه و نتیجه در پرونده می‌ماند.',
                'پیام یادآوری، رزرو بعدی را باز می‌کند.',
              ]}
            />
          </div>
        </div>
      </section>
      <section id="pricing" className="scroll-mt-20 bg-warning/10 py-16 sm:py-20">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader
            eyebrow="شروع رابطه"
            title="اولین نوبت را ثبت کنید"
            body="دورهٔ آزمایشی رایگان؛ مشتری‌ها را از دست ندهید."
          />
          <Link to="/business/register" className={primaryCtaClass}>
            ساخت چرخهٔ مشتری <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </Link>
        </div>
      </section>
      <FinalCta
        title="مشتری خوب، مسیر خوب می‌خواهد"
        body="از اولین رزرو، راه مراجعهٔ بعدی را هم روشن کنید."
      />
    </>
  );
}

function BackstageCards() {
  return (
    <div className="relative mx-auto min-h-[24rem] max-w-xl">
      <div
        className="absolute inset-x-8 top-0 h-36 rounded-t-[4rem] border border-primary/15 bg-primary/5"
        aria-hidden="true"
      />
      <div className="absolute inset-x-0 top-10 rounded-2xl border border-border bg-elevated p-5 shadow-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-primary">پشت‌صحنهٔ امروز</p>
          <span className="text-2xs text-muted">سالن رز</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { icon: CalendarDays, title: 'تقویم', body: '۶ نوبت' },
            { icon: ShieldCheck, title: 'یادآوری', body: '۳ ارسال' },
            { icon: WalletCards, title: 'بیعانه', body: '۲ تأیید' },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border border-border bg-surface p-4">
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <p className="mt-4 text-xs font-bold">{title}</p>
              <p className="mt-1 text-xs text-muted">{body}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 start-8 w-[55%] rounded-xl border border-border bg-ink p-4 text-ink-contrast shadow-2">
        <p className="text-2xs text-ink-muted">مشتری بعدی</p>
        <p className="mt-2 font-bold">مهسا / کوتاهی</p>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-accent">۱۵:۰۰</span>
          <span className="text-ink-muted">تأیید شد</span>
        </div>
      </div>
    </div>
  );
}

/** Concept 08 — backstage metaphor: the owner controls what guests never see. */
function BackstageVariant() {
  return (
    <>
      <section data-hero className="relative overflow-hidden bg-ink text-ink-contrast">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-12 sm:py-16 lg:grid-cols-[0.95fr_1.05fr] lg:gap-20 lg:py-20">
          <figure className="order-2 lg:order-1">
            <BackstageCards />
            <figcaption className="sr-only">تقویم، یادآوری و پرداخت در پشت‌صحنهٔ سالن.</figcaption>
          </figure>
          <div className="order-1 motion-safe:animate-fade-up lg:order-2">
            <p className="mb-6 flex items-center gap-3 text-xs font-bold tracking-wider text-accent">
              <span className="h-px w-10 bg-accent" aria-hidden="true" />
              پشت‌صحنهٔ سالن
            </p>
            <h1 className="max-w-xl text-4xl font-display leading-tight tracking-tight sm:text-6xl">
              مشتری فقط صحنه را می‌بیند؛ شما همه‌چیز را کنترل کنید.
            </h1>
            <p className="mt-6 max-w-xl text-md leading-8 text-ink-muted">
              از تقویم و یادآوری تا مشتری و پرداخت، کارهای پنهان سالن را در یک پشت‌صحنهٔ آرام جمع
              کنید.
            </p>
            <HeroActions primaryLabel="پشت‌صحنه را مرتب کنید" />
            <div className="mt-7">
              <TrustRail dark items={['کمتر فراموشی', 'کمتر رفت‌وبرگشت', 'کنترل بیشتر']} />
            </div>
          </div>
        </div>
      </section>

      <section id="why" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader
            eyebrow="کارهای نادیده"
            title="همان چیزهایی که اگر نباشند، حس می‌شوند"
            body="مشتری تقویم شما را نمی‌بیند؛ اما تأخیر، نوبت از دست‌رفته و پاسخ دیر را حس می‌کند."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Timer, title: 'زمان‌بندی' },
              { icon: ShieldCheck, title: 'یادآوری' },
              { icon: WalletCards, title: 'پرداخت' },
              { icon: Users, title: 'سابقه' },
            ].map(({ icon: Icon, title }) => (
              <div
                key={title}
                className="flex items-center gap-3 rounded-lg border border-border p-5"
              >
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <span className="font-bold">{title}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 overflow-hidden bg-surface py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <SectionHeader
              eyebrow="یک سیستم پشت صحنه"
              title="هر کار کوچک، جلوی یک دردسر بزرگ را می‌گیرد"
            />
            <div className="mt-8">
              <FeatureRows
                items={[
                  {
                    icon: CalendarDays,
                    title: 'تقویم هماهنگ',
                    body: 'اعضای تیم، خدمات و زمان‌ها با هم قاطی نمی‌شوند.',
                  },
                  {
                    icon: ShieldCheck,
                    title: 'یادآوری پیشگیرانه',
                    body: 'قبل از نوبت، مشتری و سالن آماده‌اند.',
                  },
                  {
                    icon: CreditCard,
                    title: 'پرداخت قابل پیگیری',
                    body: 'قانون بیعانه و وضعیت پرداخت را واضح کنید.',
                  },
                ]}
              />
            </div>
          </div>
          <figure className="overflow-hidden rounded-2xl border border-border bg-elevated p-2 shadow-3">
            <DashboardImage className="rounded-lg" />
            <figcaption className="px-2 py-3 text-xs text-muted">
              پشت‌صحنه‌ای که در پنل می‌بینید
            </figcaption>
          </figure>
        </div>
      </section>
      <section id="solutions" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader
            eyebrow="کنترل بی‌سروصدا"
            title="یک‌بار تنظیم کنید، هر روز سبک‌تر کار کنید"
          />
          <div className="mt-10">
            <NumberedSteps
              items={[
                'قوانین و ساعت کاری سالن را مشخص کنید.',
                'رزروها و پیگیری‌ها را در یک پنل انجام دهید.',
                'با گزارش ساده، مشکل بعدی را پیدا کنید.',
              ]}
            />
          </div>
        </div>
      </section>
      <section id="pricing" className="scroll-mt-20 bg-ink py-16 text-ink-contrast sm:py-20">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader
            dark
            eyebrow="ورود به پشت صحنه"
            title="سالن را از داخل آرام کنید"
            body="شروع آزمایشی رایگان و همراهی فارسی."
          />
          <Link
            to="/business/register"
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-6 font-bold text-ink no-underline"
          >
            مرتب‌کردن سالن <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </Link>
        </div>
      </section>
      <FinalCta
        dark
        title="وقتی پشت صحنه مرتب است، مشتری می‌فهمد"
        body="آرا را برای کارهای پنهان سالن آماده کنید و روی تجربه تمرکز کنید."
      />
    </>
  );
}

function FunnelDiagram() {
  const steps = [
    { icon: Camera, label: 'بیو / استوری', color: 'border-primary bg-primary/5' },
    { icon: Link2, label: 'لینک سالن', color: 'border-primary/30 bg-primary/10' },
    { icon: CalendarDays, label: 'تقویم', color: 'border-warning/50 bg-warning/10' },
    { icon: Check, label: 'نوبت قطعی', color: 'border-accent bg-accent/10' },
  ];
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-2">
      {steps.map(({ icon: Icon, label, color }, index) => (
        <div key={label} className="flex w-full max-w-sm flex-col items-center">
          <div
            className={cn(
              'flex w-full items-center justify-center gap-3 rounded-2xl border-2 px-5 py-4 shadow-1',
              color,
            )}
          >
            <Icon className="size-5 text-primary" aria-hidden="true" />
            <span className="font-bold">{label}</span>
            <span className="ms-auto text-xs text-muted">۰{index + 1}</span>
          </div>
          {index < steps.length - 1 ? (
            <div className="h-7 border-s border-dashed border-primary/40" aria-hidden="true" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Concept 09 — the user's Instagram/referral idea visualized as a simple funnel. */
function FunnelVariant() {
  return (
    <>
      <section data-hero className="relative overflow-hidden bg-primary/5">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-12 sm:py-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:py-20">
          <div className="motion-safe:animate-fade-up">
            <p className="mb-6 flex items-center gap-3 text-xs font-bold tracking-wider text-primary">
              <span className="h-px w-10 bg-primary" aria-hidden="true" />
              مسیر ورودی مشتری
            </p>
            <h1 className="max-w-xl text-4xl font-display leading-tight tracking-tight sm:text-6xl">
              بیو را به دستگاه رزرو تبدیل کن.
            </h1>
            <p className="mt-6 max-w-xl text-md leading-8 text-muted">
              یک مقصد برای بیو، استوری، QR و پیام. مشتری از هرجا بیاید، همان‌جا به زمان واقعی سالن
              می‌رسد.
            </p>
            <HeroActions primaryLabel="لینک رزرو سالن را بسازید" />
            <div className="mt-7">
              <TrustRail items={['لینک اختصاصی', 'QR قابل چاپ', 'ردیابی کانال']} />
            </div>
          </div>
          <figure>
            <FunnelDiagram />
            <figcaption className="mt-6 text-center text-xs text-muted">
              هر کانال، یک مسیر کوتاه و قابل اندازه‌گیری
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="why" className="scroll-mt-20 bg-ink py-16 text-ink-contrast sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader
            dark
            eyebrow="هر کانال، یک مقصد"
            title="مشتری را وسط راه رها نکنید"
            body="آرا فاصلهٔ بین دیدن محتوای سالن و رزرو واقعی را کوتاه می‌کند."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Camera, title: 'بیو' },
              { icon: Send, title: 'استوری' },
              { icon: QrCode, title: 'QR' },
              { icon: MessageCircle, title: 'پیام' },
            ].map(({ icon: Icon, title }) => (
              <div key={title} className="rounded-lg border border-ink-border p-5">
                <Icon className="size-6 text-accent" aria-hidden="true" />
                <p className="mt-5 font-bold">{title}</p>
                <p className="mt-2 text-xs leading-6 text-ink-muted">ورودی آمادهٔ رزرو</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <figure className="order-2 mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-elevated p-2 shadow-3 lg:order-1">
            <BookingImage className="rounded-xl" />
            <figcaption className="px-2 py-3 text-center text-xs text-muted">
              مقصد نهایی، روی موبایل مشتری
            </figcaption>
          </figure>
          <div className="order-1 lg:order-2">
            <SectionHeader
              eyebrow="از کلیک تا تقویم"
              title="سه ثانیه برای فهمیدن، سه کلیک برای رزرو"
              body="صفحهٔ رزرو را کوتاه نگه دارید تا کمپین شما در همان لحظه نتیجه بدهد."
            />
            <div className="mt-8">
              <FeatureRows
                items={[
                  {
                    icon: Link2,
                    title: 'لینک جدا برای هر کانال',
                    body: 'بیو و استوری را با هم قاطی نکنید؛ نتیجه را ببینید.',
                  },
                  {
                    icon: MousePointer2,
                    title: 'مسیر موبایلی',
                    body: 'خدمت، زمان و تأیید؛ بدون نصب اپ.',
                  },
                  {
                    icon: BarChart3,
                    title: 'گزارش ورودی',
                    body: 'بدانید کدام کمپین مشتری آورده است.',
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </section>

      <section
        id="solutions"
        className="scroll-mt-20 border-y border-border bg-surface py-16 sm:py-20"
      >
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader eyebrow="فلو قابل اجرا" title="کمپین بعدی را همین چهار مرحله بسازید" />
          <div className="mt-10">
            <NumberedSteps
              items={[
                'برای سالن لینک اختصاصی بسازید.',
                'لینک را در بیو و استوری منتشر کنید.',
                'مشتری زمان واقعی را انتخاب کند.',
                'نتیجهٔ هر کانال را در پنل ببینید.',
              ]}
            />
          </div>
        </div>
      </section>
      <section id="pricing" className="scroll-mt-20 bg-warning/10 py-16 sm:py-20">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader
            eyebrow="قبل از تبلیغ"
            title="اول مقصد رزرو را آماده کنید"
            body="آزمایشی رایگان؛ بعد لینک را پخش کنید."
          />
          <Link to="/business/register" className={primaryCtaClass}>
            ساخت کمپین سالن <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </Link>
        </div>
      </section>
      <FinalCta
        title="استوری بعدی، یک نوبت بعدی"
        body="بیوی سالن را از یک آدرس ساده به مسیر رزرو تبدیل کنید."
      />
    </>
  );
}

function SetupSheet() {
  const items = [
    ['نام سالن', 'سالن رز', true],
    ['خدمات اصلی', '۴ خدمت اضافه شد', true],
    ['ساعت کاری', 'شنبه تا پنجشنبه / ۹ تا ۲۰', true],
    ['لینک رزرو', 'ara.ir/rose', false],
  ] as const;
  return (
    <div className="rounded-2xl border border-border bg-elevated p-5 shadow-3 sm:p-7">
      <div className="flex items-center justify-between border-b border-border pb-5">
        <div>
          <p className="text-xs text-muted">راه‌اندازی آرا</p>
          <p className="mt-1 text-xl font-bold">سالن رز</p>
        </div>
        <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ListChecks className="size-5" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-5 space-y-3">
        {items.map(([label, value, complete]) => (
          <div key={label} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-xs',
                complete
                  ? 'bg-primary text-primary-contrast'
                  : 'border border-primary text-primary',
              )}
            >
              {complete ? <Check className="size-4" aria-hidden="true" /> : '۴'}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-1 truncate text-sm font-bold">{value}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-lg bg-primary p-4 text-primary-contrast">
        <p className="text-xs opacity-80">قدم بعد</p>
        <p className="mt-1 font-bold">لینک را در بیو بگذارید</p>
        <div className="mt-3 h-2 overflow-hidden rounded-pill bg-primary-contrast/20">
          <div className="h-full w-3/4 rounded-pill bg-primary-contrast" />
        </div>
      </div>
    </div>
  );
}

/** Concept 10 — a one-page setup sheet for the fastest, least intimidating entry. */
function ChecklistVariant() {
  return (
    <>
      <section data-hero className="relative overflow-hidden bg-surface">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-12 sm:py-16 lg:grid-cols-[1fr_0.9fr] lg:gap-20 lg:py-20">
          <div className="motion-safe:animate-fade-up">
            <p className="mb-6 flex items-center gap-3 text-xs font-bold tracking-wider text-primary">
              <span className="h-px w-10 bg-primary" aria-hidden="true" />
              راه‌اندازی بدون ترس
            </p>
            <h1 className="max-w-xl text-4xl font-display leading-tight tracking-tight sm:text-6xl">
              فردا سالن شما آمادهٔ رزرو است.
            </h1>
            <p className="mt-6 max-w-xl text-md leading-8 text-muted">
              نه دورهٔ طولانی، نه تنظیمات مبهم. چهار چیز را کامل کنید و یک لینک رزرو واقعی تحویل
              بگیرید.
            </p>
            <HeroActions primaryLabel="چک‌لیست سالن را شروع کنید" />
            <div className="mt-7">
              <TrustRail items={['شروع رایگان', 'بدون کارت بانکی', 'قابل تکمیل بعداً']} />
            </div>
          </div>
          <figure>
            <SetupSheet />
            <figcaption className="mt-4 text-center text-xs text-muted">
              یک برگه برای شروع؛ پنل کامل بعد از آن آماده است.
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="why" className="scroll-mt-20 border-b border-border py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader
            eyebrow="چرا این‌قدر ساده؟"
            title="چون صاحب سالن وقت آموزش نرم‌افزار ندارد"
            body="آرا باید در همان جلسهٔ اول قابل فهم باشد؛ هر قابلیت، یک فایدهٔ روشن برای روز سالن دارد."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: MousePointer2,
                title: 'شروع سریع',
                body: 'از نام سالن و خدمات اصلی شروع کنید.',
              },
              {
                icon: PanelTop,
                title: 'ادامهٔ مرحله‌ای',
                body: 'اعضای تیم، قوانین و گزارش را بعداً اضافه کنید.',
              },
              {
                icon: Headphones,
                title: 'پشتیبانی نزدیک',
                body: 'اگر جایی ماندید، پاسخ فارسی در دسترس است.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <article
                key={title}
                className="rounded-lg border border-border bg-elevated p-6 shadow-1"
              >
                <Icon className="size-6 text-primary" aria-hidden="true" />
                <h3 className="mt-6 font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 bg-warning/10 py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <SectionHeader
              eyebrow="بعد از چهار تیک"
              title="سالن فقط یک فرم نیست"
              body="وقتی شروع کردید، تقویم، مشتری، رزرو آنلاین، QR، یادآوری و گزارش را در همان مسیر دارید."
            />
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                'تقویم تیمی',
                'صفحهٔ رزرو',
                'پروندهٔ مشتری',
                'لینک و QR',
                'یادآوری نوبت',
                'گزارش ظرفیت',
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-md border border-border bg-elevated p-3 text-sm font-semibold"
                >
                  <Check className="size-4 text-primary" aria-hidden="true" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <figure className="overflow-hidden rounded-2xl border border-border bg-elevated p-2 shadow-3">
            <DashboardImage className="rounded-lg" />
            <figcaption className="px-2 py-3 text-xs text-muted">
              چهار تیک اول؛ بقیهٔ پنل بعد از ورود
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="solutions" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader eyebrow="فقط همین چهار قدم" title="از صفر تا لینک رزرو" />
          <div className="mt-10">
            <NumberedSteps
              items={[
                'نام و اطلاعات پایهٔ سالن را بنویسید.',
                'خدمات و قیمت‌های اصلی را اضافه کنید.',
                'ساعت‌های قابل رزرو را مشخص کنید.',
                'لینک را منتشر کنید و اولین نوبت را بگیرید.',
              ]}
            />
          </div>
        </div>
      </section>
      <section id="pricing" className="scroll-mt-20 border-t border-border py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <SectionHeader
            eyebrow="بدون غافلگیری"
            title="قیمت را قبل از پرداخت ببینید"
            body="شروع آزمایشی رایگان است و تعرفهٔ اشتراک داخل پنل شفاف نمایش داده می‌شود."
          />
          <Link to="/business/register" className={primaryCtaClass}>
            شروع چک‌لیست <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </Link>
        </div>
      </section>
      <FinalCta
        title="چهار تیک تا سالن آنلاین"
        body="از کوچک‌ترین قدم شروع کنید؛ آرا بقیهٔ مسیر را کنار شما می‌چیند."
      />
    </>
  );
}

export function BusinessLandingContent({
  variant,
  preview,
}: {
  variant: LandingVariant;
  preview: boolean;
}) {
  return (
    <>
      {preview ? <VariantTabs active={variant} /> : null}
      {variant === 'business' ? <BusinessInspiredVariant /> : null}
      {variant === 'day' ? <DayPlannerVariant /> : null}
      {variant === 'card' ? <SalonCardVariant /> : null}
      {variant === 'heatmap' ? <HeatmapVariant /> : null}
      {variant === 'command' ? <CommandVariant /> : null}
      {variant === 'compare' ? <CompareVariant /> : null}
      {variant === 'mirror' ? <MirrorVariant /> : null}
      {variant === 'loop' ? <LoopVariant /> : null}
      {variant === 'backstage' ? <BackstageVariant /> : null}
      {variant === 'funnel' ? <FunnelVariant /> : null}
      {variant === 'checklist' ? <ChecklistVariant /> : null}
      <FAQSection />
    </>
  );
}
