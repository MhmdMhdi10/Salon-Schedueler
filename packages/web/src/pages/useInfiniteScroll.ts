import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Client-side infinite scroll hook using IntersectionObserver.
 *
 * Maintains a `visibleCount` state that starts at `pageSize` and increments by
 * `pageSize` each time the sentinel element is observed in the viewport. Resets
 * to the first page when `resetKey` changes (e.g. when URL filter params change).
 *
 * @param totalCount - Total number of items available (after filtering)
 * @param pageSize   - Number of items to show per "page" (default 24)
 * @param resetKey   - A string key that resets pagination when it changes (e.g.
 *                     serialized filter params)
 *
 * @returns visibleCount, sentinelRef, hasMore, isLoadingMore
 */
export function useInfiniteScroll(totalCount: number, pageSize = 24, resetKey = '') {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset to first page when filters change
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [resetKey, pageSize]);

  const hasMore = visibleCount < totalCount;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && visibleCount < totalCount) {
          setIsLoadingMore(true);
          // Small delay for perceived loading (shows skeleton briefly)
          timer = setTimeout(() => {
            setVisibleCount((prev) => Math.min(prev + pageSize, totalCount));
            setIsLoadingMore(false);
          }, 150);
        }
      },
      { rootMargin: '200px' },
    );

    io.observe(sentinel);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [visibleCount, totalCount, pageSize]);

  const reset = useCallback(() => {
    setVisibleCount(pageSize);
  }, [pageSize]);

  return { visibleCount, sentinelRef, hasMore, isLoadingMore, reset };
}
