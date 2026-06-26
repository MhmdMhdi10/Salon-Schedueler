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
}

/**
 * Lazy-loaded busiest-window bar chart (ui-ux §12 "lazy-load charts", R5.3,
 * R9.3). This module is imported via `React.lazy` from `AnalyticsPage`, so the
 * chart code lands in its own chunk and **never blocks first paint** — the KPI
 * cards and table render immediately while this loads behind a `Suspense`
 * fallback.
 *
 * The chart is a token-driven, dependency-free SVG/flex bar chart (no external
 * chart library is bundled). It is RTL-first (logical flex flow), uses tabular
 * numerals for the value labels, and is exposed to assistive tech with an
 * accessible `role="img"` + label while the bars themselves are decorative.
 * Counts render with Persian digits via `<Num>` (R7.4).
 */
export function AnalyticsChart({ data }: AnalyticsChartProps) {
  const { t } = useTranslation();
  const max = data.reduce((m, d) => (d.value > m ? d.value : m), 0);

  return (
    <div
      role="img"
      aria-label={t('admin.analyticsPage.chart.label')}
      className="flex flex-col gap-3"
    >
      {data.map((datum, index) => {
        const pct = max > 0 ? Math.round((datum.value / max) * 100) : 0;
        return (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={`${datum.label}-${index}`}
            className="flex items-center gap-3"
          >
            <span className="w-28 shrink-0 truncate text-xs text-muted">
              {datum.label}
            </span>
            <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-surface">
              <div
                className="h-full rounded-sm bg-primary"
                style={{ inlineSize: `${pct}%` }}
                aria-hidden="true"
              />
            </div>
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
