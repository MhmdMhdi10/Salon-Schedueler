import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/** Brief branded progress line shown after real pathname/search navigations. */
export function RouteProgress() {
  const { pathname, search } = useLocation();
  const firstRender = useRef(true);
  const [cycle, setCycle] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    setCycle((value) => value + 1);
    setVisible(true);
    const timeout = window.setTimeout(() => setVisible(false), 650);
    return () => window.clearTimeout(timeout);
  }, [pathname, search]);

  if (!visible) return null;

  return (
    <div
      data-testid="route-progress"
      role="progressbar"
      aria-label="در حال باز کردن صفحه"
      className="pointer-events-none fixed inset-x-0 top-0 z-toast h-1 overflow-hidden bg-primary/10"
    >
      <span key={cycle} className="ara-route-progress block h-full origin-right bg-primary" />
    </div>
  );
}

export default RouteProgress;
