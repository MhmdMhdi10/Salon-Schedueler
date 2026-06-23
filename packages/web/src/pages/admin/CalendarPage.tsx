import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Day/week calendar views per chair and staff.
 * Requirements: 15.1, 15.2
 */
export function CalendarPage() {
  const { t } = useTranslation();
  const [view, setView] = useState<'day' | 'week'>('day');

  return (
    <div data-testid="admin-calendar">
      <h1>{t('admin.calendar')}</h1>
      <div role="tablist">
        <button
          role="tab"
          aria-selected={view === 'day'}
          onClick={() => setView('day')}
        >
          روز
        </button>
        <button
          role="tab"
          aria-selected={view === 'week'}
          onClick={() => setView('week')}
        >
          هفته
        </button>
      </div>
      <div data-testid={`calendar-${view}`}>
        <p>Calendar {view} view placeholder</p>
      </div>
    </div>
  );
}
