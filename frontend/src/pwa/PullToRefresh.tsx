import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import './PullToRefresh.css';

const REFRESH_DISTANCE = 96;

function isStandalonePwa(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches)
  );
}

const APP_SCROLL_PANES = '#owner-content, #platform-admin-content';

function hasNestedVerticalScroller(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  let element: Element | null = target;
  while (element && element !== document.documentElement && element !== document.body) {
    if (element.matches(APP_SCROLL_PANES)) return false;
    const style = window.getComputedStyle(element);
    if (
      /(auto|scroll|overlay)/.test(style.overflowY) &&
      element.scrollHeight > element.clientHeight + 1
    ) {
      return true;
    }
    element = element.parentElement;
  }

  return false;
}

function isAtDocumentTop(target?: EventTarget | null): boolean {
  if (target instanceof Element) {
    const appContent = target.closest(APP_SCROLL_PANES);
    if (appContent) return appContent.scrollTop <= 1;
  }
  return window.scrollY <= 1 && document.documentElement.scrollTop <= 1 && document.body.scrollTop <= 1;
}

export function PullToRefresh() {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (!isStandalonePwa()) return;

    let startX = 0;
    let startY = 0;
    let startTarget: EventTarget | null = null;
    let active = false;
    let reloadTimer = 0;

    const reset = () => {
      active = false;
      distanceRef.current = 0;
      setDistance(0);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (
        event.touches.length !== 1 ||
        refreshingRef.current ||
        !isAtDocumentTop(event.target) ||
        hasNestedVerticalScroller(event.target)
      ) {
        active = false;
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable="true"], [data-pull-refresh-ignore]')
      ) {
        active = false;
        return;
      }

      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      startTarget = event.target;
      active = true;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!active || event.touches.length !== 1 || refreshingRef.current) return;

      const touch = event.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (deltaY <= 0 || Math.abs(deltaX) > deltaY) {
        reset();
        return;
      }

      if (!isAtDocumentTop(startTarget)) {
        reset();
        return;
      }

      if (deltaY > 6 && event.cancelable) event.preventDefault();
      distanceRef.current = Math.min(80, (deltaY - 6) * 0.6);
      setDistance(Math.max(0, distanceRef.current));
    };

    const onTouchEnd = () => {
      if (!active || refreshingRef.current) return;
      active = false;

      if (distanceRef.current * (1 / 0.6) >= REFRESH_DISTANCE - 6) {
        refreshingRef.current = true;
        setRefreshing(true);
        reloadTimer = window.setTimeout(() => window.location.reload(), 300);
        return;
      }

      reset();
    };

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    document.addEventListener('touchcancel', reset, { capture: true, passive: true });

    return () => {
      window.clearTimeout(reloadTimer);
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('touchend', onTouchEnd, true);
      document.removeEventListener('touchcancel', reset, true);
    };
  }, []);

  const visible = distance > 0 || refreshing;
  const ready = distance >= 54;
  const scale = 0.82 + Math.min(distance / 54, 1) * 0.18;

  return (
    <div
      className={`pwa-pull-refresh ${visible ? 'is-visible' : ''} ${ready ? 'is-ready' : ''} ${refreshing ? 'is-refreshing' : ''}`}
      style={{ transform: `translateX(-50%) translateY(${Math.min(distance * 0.3, 24)}px) scale(${scale})` }}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-hidden={!visible}
      aria-label={refreshing ? 'در حال تازه‌سازی' : ready ? 'رها کنید تا تازه شود' : 'برای تازه‌شدن بکشید'}
    >
      <RefreshCw
        className="pwa-pull-refresh-icon"
        aria-hidden="true"
        style={{ transform: `rotate(${Math.round((distance / 54) * 360)}deg)` }}
      />
    </div>
  );
}
