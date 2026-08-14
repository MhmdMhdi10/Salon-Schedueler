import { cn } from './cn';
import { Motif } from '../brand/Motif';

export interface SalonPlaceholderProps {
  /**
   * Sizing and layout classes (aspect-ratio, width, height, rounded corners).
   * Never pass color classes — the placeholder derives colors from tokens.
   */
  className?: string;
  /**
   * If provided, the placeholder is treated as meaningful content (not decorative)
   * and the alt text is exposed to assistive technology. When omitted the entire
   * placeholder is aria-hidden (decorative).
   */
  alt?: string;
}

/**
 * Branded salon image placeholder — used where salon-specific imagery is
 * unavailable (Req 9.6). Renders the brand `Motif` in "watermark" variant
 * centered on a `--color-surface` background, styled entirely via design tokens.
 *
 * Decorative by default (`aria-hidden`). Pass `alt` to make it a meaningful
 * landmark (e.g. for a salon whose gallery is empty but the placeholder carries
 * semantic weight in context).
 */
export function SalonPlaceholder({ className, alt }: SalonPlaceholderProps) {
  const isDecorative = !alt;

  return (
    <div
      className={cn('flex items-center justify-center bg-surface', className)}
      role={isDecorative ? undefined : 'img'}
      aria-label={isDecorative ? undefined : alt}
      aria-hidden={isDecorative ? true : undefined}
    >
      <Motif variant="watermark" className="h-16 w-16 text-border opacity-50" />
    </div>
  );
}

export default SalonPlaceholder;
