import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { Num } from './Num';
import { cn } from './cn';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  ariaLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
  className?: string;
  testId?: string;
  /** Compact mobile-friendly controls for dense cards and dialogs. */
  compact?: boolean;
}

function visiblePages(page: number, pageCount: number): Array<number | 'ellipsis'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const ordered = [...pages].filter((value) => value > 0 && value <= pageCount).sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];

  ordered.forEach((value, index) => {
    if (index > 0 && value - ordered[index - 1] > 1) result.push('ellipsis');
    result.push(value);
  });
  return result;
}

/** Compact, RTL-safe pagination that wraps cleanly on narrow screens. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  ariaLabel = 'صفحه‌بندی',
  previousLabel = 'قبلی',
  nextLabel = 'بعدی',
  className,
  testId,
  compact = false,
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (pageCount <= 1 || total <= 0) return null;

  const currentPage = Math.min(Math.max(1, page), pageCount);
  const firstItem = (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, total);

  return (
    <nav
      aria-label={ariaLabel}
      data-testid={testId}
      className={cn(
        'flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-2',
        compact && '!flex-nowrap !gap-1.5 overflow-hidden !p-1.5',
        className,
      )}
    >
      <p className={cn('m-0 min-w-0 truncate text-xs text-muted', compact && 'shrink')} aria-live="polite">
        نمایش <Num value={firstItem} /> تا <Num value={lastItem} /> از <Num value={total} />
      </p>

      {compact ? (
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="md"
            className="!h-9 !min-h-9 !min-w-9 !px-1"
            disabled={currentPage === 1}
            onClick={() => onPageChange(currentPage - 1)}
            aria-label={previousLabel}
          >
            <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            className="!h-9 !min-h-9 !min-w-9 !px-1"
            disabled={currentPage === pageCount}
            onClick={() => onPageChange(currentPage + 1)}
            aria-label={nextLabel}
          >
            <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="md"
            className="h-10 min-h-10 px-2 text-xs"
            disabled={currentPage === 1}
            onClick={() => onPageChange(currentPage - 1)}
            aria-label={previousLabel}
          >
            <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            <span className="hidden min-[380px]:inline">{previousLabel}</span>
          </Button>

          {visiblePages(currentPage, pageCount).map((value, index) =>
            value === 'ellipsis' ? (
              <span
                key={`ellipsis-${index}`}
                aria-hidden="true"
                className="inline-flex h-10 min-w-6 items-center justify-center text-muted"
              >
                …
              </span>
            ) : (
              <Button
                key={value}
                type="button"
                variant={value === currentPage ? 'primary' : 'secondary'}
                size="md"
                className="h-10 min-h-10 min-w-10 px-2"
                aria-current={value === currentPage ? 'page' : undefined}
                aria-label={`صفحه ${value}`}
                onClick={() => onPageChange(value)}
              >
                <Num value={value} />
              </Button>
            ),
          )}

          <Button
            type="button"
            variant="ghost"
            size="md"
            className="h-10 min-h-10 px-2 text-xs"
            disabled={currentPage === pageCount}
            onClick={() => onPageChange(currentPage + 1)}
            aria-label={nextLabel}
          >
            <span className="hidden min-[380px]:inline">{nextLabel}</span>
            <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
          </Button>
        </div>
      )}
    </nav>
  );
}
