import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Scroll to a hash target after client-side route navigation. */
export function useHashScroll() {
  const { hash } = useLocation();

  useEffect(() => {
    const targetId = hash.slice(1);
    if (!targetId) return;

    let observer: MutationObserver | null = null;
    let fallbackTimer: number | undefined;
    const scrollToTarget = () => {
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
        observer?.disconnect();
        if (fallbackTimer !== undefined) window.clearInterval(fallbackTimer);
      }
    };

    scrollToTarget();
    if (!document.getElementById(targetId)) {
      if (typeof MutationObserver !== 'undefined' && document.body) {
        observer = new MutationObserver(scrollToTarget);
        observer.observe(document.body, { childList: true, subtree: true });
      } else {
        let attempts = 0;
        fallbackTimer = window.setInterval(() => {
          scrollToTarget();
          attempts += 1;
          if (attempts >= 100 && fallbackTimer !== undefined) {
            window.clearInterval(fallbackTimer);
          }
        }, 50);
      }
    }

    return () => {
      observer?.disconnect();
      if (fallbackTimer !== undefined) window.clearInterval(fallbackTimer);
    };
  }, [hash]);
}
