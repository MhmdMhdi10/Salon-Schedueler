import { cn } from '../ui/cn';

export interface BrandLogoProps {
  className?: string;
  inverse?: boolean;
}

/** Selected آرا wordmark + smart-calendar mark. Decorative inside a labelled link. */
export function BrandLogo({ className, inverse = false }: BrandLogoProps) {
  return (
    <img
      src="/brand/ara-logo.png"
      width={955}
      height={480}
      alt=""
      aria-hidden="true"
      className={cn(
        'ara-brand-logo block h-10 w-auto shrink-0 object-contain',
        inverse && 'brightness-0 invert',
        className,
      )}
    />
  );
}

export default BrandLogo;
