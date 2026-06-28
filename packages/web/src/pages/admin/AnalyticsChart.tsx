import { useTranslation } from 'react-i18next';
import { Num } from '../../components/ui';

/**
 * A single bar in the busiest-window chart (display-normalized).
 */
export interface ChartDatum {
  /** Localized window label, e.g. «۰۹:۰۰ – ۱۲:۰۰». */
  label: string;
  /** Concurrent appointment count for the window. */
  value: number;
}

export interface AnalyticsChartProps {
  data: ChartDatum[];
  /** ID of the accessible table equivalent (for aria-describedby linkage). */
  tableId?: string;
}

/**
 * Lazy-loaded busiest-window bar chart (ui-ux §12 "lazy-load charts", R5.2,
 * R5.3, R9.3). This module is imported via `React.lazy` from `AnalyticsPage`,
 * so the chart code lands in its own chunk and **never blocks first paint** —
 * the KPI cards and table render immediately while this loads behind a
 * `Suspense` fallback.
 *
 * Non-color-only encoding (R5.2): every bar is paired with a visible text label
 * (the window name) and a visible numeric value (the count), so no metric is
 * conveyed by color alone. The bar fill inherits `--color-primary` (the
 * signature plum-wine) via `bg-primary`. Each row also carries a screen-reader
 * accessible label combining the window + count for AT users. The chart links
 * to the accessible busiest-windows table via `aria-describedby`.
 *
 * The chart is a token-driven, dependency-free flex bar chart (no external
 * chart library is bundled). It is RTL-first (logical flex flow), uses tabular
 * numerals for the value labels, and is exposed to assistive tech with an
 * accessible `role="img"` + label while the bars themselves are decorative.
 * Counts render with Persian digits via `<Num>` (R7.4).
 */
export function AnalyticsChart({ data, tableId }: AnalyticsChartProps) {
  const { t } = useTranslation();
  const max = data.reduce((m, d) => (d.value > m ? d.value : m), 0);

  return (
    <div
      role="img"
      aria-label={t('admin.analyticsPage.chart.label')}
      aria-describedby={tableId}
      className="flex flex-col gap-3"
    >
      {data.map((datum, index) => {
        const pct = max > 0 ? Math.round((datum.value / max) * 100) : 0;
        return (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={`${datum.label}-${index}`}
            className="flex items-center gap-3"
            role="group"
            aria-label={t('admin.analyticsPage.chart.barLabel', {
              window: datum.label,
              count: datum.value,
            })}
          >
            {/* Visible text label — non-color encoding for the window name */}
            <span className="w-28 shrink-0 truncate text-xs text-muted">
              {datum.label}
            </span>
            {/* Bar: fill inherits --color-primary; decorative (meaning conveyed by text) */}
            <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-surface">
              <div
                className="h-full rounded-sm bg-primary"
                style={{ inlineSize: `${pct}%` }}
                aria-hidden="true"
              />
            </div>
            {/* Visible numeric value — non-color encoding for the count */}
            <span className="w-8 shrink-0 text-end text-xs font-medium tabular-nums text-text">
              <Num value={datum.value} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default AnalyticsChart;
