import { forwardRef, useState } from 'react';
import { cn } from './cn';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Image source. When absent or it fails to load, the initials fallback shows. */
  src?: string;
  /**
   * Full name used to derive the initials fallback and, when `decorative` is
   * false, the accessible label/alt text. e.g. «سارا محمدی» → «س».
   */
  name?: string;
  /** Visual size. Defaults to `md`. */
  size?: AvatarSize;
  /**
   * When true the avatar conveys no information beyond decoration (a labelled
   * sibling already names the person), so it is hidden from assistive tech.
   * When false (default) it exposes `name` as its accessible label/alt.
   */
  decorative?: boolean;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'h-8 w-8 text-2xs',
  md: 'h-10 w-10 text-xs',
  lg: 'h-12 w-12 text-sm',
};

/**
 * Derive up to two initials from a name. Works for Persian and Latin runs: the
 * first character of the first one or two whitespace-separated tokens.
 */
function initialsFromName(name: string | undefined): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + second).trim();
}

/**
 * Avatar with an image and an initials fallback. Per the design inventory it
 * supports **decorative vs labelled** use (ui-ux §10):
 *
 *  - labelled (default): exposes `name` as the image `alt` / a `role="img"`
 *    label on the initials fallback, so screen readers announce who it is.
 *  - decorative: `aria-hidden`/`alt=""` when a nearby element already names the
 *    person, avoiding duplicate announcements.
 *
 * The initials fallback also renders when no `src` is provided or the image
 * fails to load.
 */
export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { src, name, size = 'md', decorative = false, className, ...rest },
  ref,
) {
  const [failed, setFailed] = useState(false);
  const initials = initialsFromName(name);
  const showImage = Boolean(src) && !failed;

  return (
    <span
      ref={ref}
      aria-hidden={decorative || undefined}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden',
        'rounded-pill bg-surface text-text font-medium',
        'border border-border select-none',
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {showImage ? (
        <img
          src={src}
          alt={decorative ? '' : (name ?? '')}
          width={48}
          height={48}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          role={decorative ? undefined : 'img'}
          aria-label={decorative ? undefined : name || undefined}
        >
          {initials || '؟'}
        </span>
      )}
    </span>
  );
});
