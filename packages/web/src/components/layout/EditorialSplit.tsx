import { cn } from '../ui/cn';

export interface EditorialSplitProps {
  /**
   * The two columns of the split. Exactly two children are expected (e.g. a
   * copy block and a media block); flow order is start → end, so under RTL the
   * first child sits at the inline-start (visually right).
   */
  children: React.ReactNode;
  /**
   * Which column is the wider (1.4fr) lead. `start` (default) makes the first
   * child wide; `end` makes the second child wide — alternate between rows so
   * the page never reads as a symmetric two-up grid (design §3, R1.4).
   */
  lead?: 'start' | 'end';
  /** Extra sizing/spacing classes (tokens only). */
  className?: string;
}

/**
 * `EditorialSplit` — an **asymmetric** two-column primitive (design §3, R1.4,
 * R2.2). It deliberately avoids the generic 50/50 split: one column takes 1.4fr,
 * the other 1fr. Below `md` it collapses to a single stacked column for phones
 * (the dominant funnel traffic). Pure CSS-grid with logical flow — no physical
 * `left`/`right`, tokenized `gap` only — so it mirrors correctly in RTL.
 */
export function EditorialSplit({
  children,
  lead = 'start',
  className,
}: EditorialSplitProps) {
  return (
    <div
      data-layout="editorial-split"
      data-lead={lead}
      className={cn(
        'grid grid-cols-1 gap-6',
        // Asymmetric ratio at md+; the fr-based template flows start→end so it
        // honors `dir` automatically (the wide column is at the inline-start
        // for `start`, inline-end for `end`).
        lead === 'start'
          ? 'md:grid-cols-[1.4fr_1fr]'
          : 'md:grid-cols-[1fr_1.4fr]',
        'md:items-center',
        className,
      )}
    >
      {children}
    </div>
  );
}

export default EditorialSplit;
