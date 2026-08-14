import { useCallback, useEffect, useMemo, useState } from 'react';

export interface PaginationState<T> {
  page: number;
  pageCount: number;
  pageItems: T[];
  total: number;
  pageSize: number;
  goToPage: (page: number) => void;
  resetPage: () => void;
}

/**
 * Keeps large client-side lists bounded in the DOM while preserving the full
 * collection for mutations and optimistic updates.
 */
export function usePagination<T>(items: readonly T[], pageSize: number): PaginationState<T> {
  const safePageSize = Math.max(1, pageSize);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / safePageSize));
  const [requestedPage, setRequestedPage] = useState(1);
  const page = Math.min(requestedPage, pageCount);

  useEffect(() => {
    if (requestedPage !== page) setRequestedPage(page);
  }, [page, requestedPage]);

  const goToPage = useCallback(
    (nextPage: number) => {
      setRequestedPage(Math.min(Math.max(1, Math.trunc(nextPage)), pageCount));
    },
    [pageCount],
  );

  const resetPage = useCallback(() => setRequestedPage(1), []);

  const pageItems = useMemo(
    () => items.slice((page - 1) * safePageSize, page * safePageSize),
    [items, page, safePageSize],
  );

  return { page, pageCount, pageItems, total, pageSize: safePageSize, goToPage, resetPage };
}
