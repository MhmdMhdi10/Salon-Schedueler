import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Home, Search } from 'lucide-react';
import { SeoHead } from '../components/seo';
import { Motif } from '../components/brand/Motif';
import { toPersianDigits } from '../components/ui/Num';
import { cn } from '../components/ui/cn';
import { DISCOVERY_CATEGORIES } from '../data/taxonomy';

/**
 * Catch-all 404 (route contract: `*` → NotFoundPage, noindex).
 *
 * A dead URL still converts: the page offers the hero search (submits to
 * `/search?q=…`), a home CTA, and the canonical category links from
 * `data/taxonomy.ts`. `SeoHead` defaults to `noindex,follow`, which is exactly
 * what a soft-404 page must emit (seo §8) — no `index` opt-in here.
 */
export function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  return (
    <div className="relative overflow-hidden bg-bg">
      <SeoHead title={t('notFound.title')} />

      <div className="mx-auto flex min-h-[60vh] w-full max-w-container flex-col items-center justify-center px-4 py-16 text-center">
        {/* Signature brand moment instead of a bare error code. */}
        <Motif variant="mark" className="h-12 w-12" aria-hidden />

        <p className="mt-6 text-display text-5xl text-primary" aria-hidden="true">
          {toPersianDigits(404)}
        </p>
        <h1 className="mt-3 text-display text-2xl text-text">{t('notFound.heading')}</h1>
        <p className="mt-3 max-w-prose text-sm text-muted">{t('notFound.body')}</p>

        {/* Search-first recovery — same contract as the home hero. */}
        <form
          role="search"
          className="mt-8 flex w-full max-w-xl items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            navigate(`/search?q=${encodeURIComponent(query.trim())}`);
          }}
        >
          <label htmlFor="notfound-search" className="sr-only">
            {t('notFound.searchLabel')}
          </label>
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute inset-y-0 start-3 my-auto h-5 w-5 text-muted"
              aria-hidden="true"
            />
            <input
              id="notfound-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('notFound.searchPlaceholder')}
              className={cn(
                'w-full rounded-lg border border-border bg-elevated py-3 pe-4 ps-11 text-sm text-text shadow-1',
                'placeholder:text-muted',
                'outline-none focus-visible:outline focus-visible:outline-2',
                'focus-visible:outline-offset-2 focus-visible:outline-focus',
              )}
            />
          </div>
          <button
            type="submit"
            className={cn(
              'inline-flex min-h-[44px] items-center gap-2 rounded-pill bg-primary px-5 py-2 text-sm font-medium text-primary-contrast shadow-1',
              'transition-opacity duration-fast ease-standard hover:opacity-90 active:translate-y-px',
              'outline-none focus-visible:outline focus-visible:outline-2',
              'focus-visible:outline-offset-2 focus-visible:outline-focus',
            )}
          >
            {t('notFound.searchSubmit')}
          </button>
        </form>

        <Link
          to="/"
          className={cn(
            'mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-primary no-underline',
            'transition-colors duration-fast ease-standard hover:bg-surface',
            'outline-none focus-visible:outline focus-visible:outline-2',
            'focus-visible:outline-offset-2 focus-visible:outline-focus',
          )}
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          {t('notFound.homeCta')}
        </Link>

        {/* Canonical category links — always-real destinations. */}
        <nav aria-label={t('notFound.categoriesTitle')} className="mt-10 w-full">
          <h2 className="text-sm font-semibold text-muted">{t('notFound.categoriesTitle')}</h2>
          <ul role="list" className="mt-4 flex flex-wrap justify-center gap-2">
            {DISCOVERY_CATEGORIES.map(({ slug, label }) => (
              <li key={slug}>
                <Link
                  to={`/services/${slug}`}
                  className={cn(
                    'inline-flex min-h-[44px] items-center rounded-pill border border-border bg-surface px-4 py-2 text-sm text-text no-underline',
                    'transition-colors duration-fast ease-standard hover:border-primary hover:text-primary',
                    'outline-none focus-visible:outline focus-visible:outline-2',
                    'focus-visible:outline-offset-2 focus-visible:outline-focus',
                  )}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

export default NotFoundPage;
