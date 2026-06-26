import { forwardRef } from 'react';
import { cn } from './cn';

/**
 * One responsive image format candidate for a `<picture>` `<source>` (task
 * 11.2; R9.5). Each entry pairs a MIME `type` with the `srcSet` (responsive
 * width candidates) the browser uses for that format. The browser picks the
 * first `type` it supports, so order matters: list the most-compressed format
 * first (AVIF → WebP → the `<img>` fallback).
 */
export interface PictureSource {
  /** MIME type, e.g. `image/avif` or `image/webp`. */
  type: string;
  /** Responsive candidate set, e.g. `"/hero/hero-640.avif 640w, …"`. */
  srcSet: string;
}

export interface PictureProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> {
  /** Modern-format sources, most-compressed first (AVIF, then WebP). */
  sources: PictureSource[];
  /** Fallback `<img src>` (a universally-supported PNG/JPG). */
  src: string;
  /** Fallback responsive candidate set for the `<img>` itself. */
  fallbackSrcSet?: string;
  /** Required `alt` (use `""` for decorative images). */
  alt: string;
  /** Explicit intrinsic width — reserves the box so there is no CLS (R9.6). */
  width: number;
  /** Explicit intrinsic height — reserves the box so there is no CLS (R9.6). */
  height: number;
  /** `sizes` hint shared by every `<source>` and the `<img>`. */
  sizes?: string;
  /** Optional class on the wrapping `<picture>` element. */
  pictureClassName?: string;
}

/**
 * Token-driven `<picture>` wrapper that serves modern, compressed AVIF/WebP
 * formats with a PNG/JPG fallback (task 11.2; R9.5, R9.6; ui-ux §12, seo §9).
 *
 * Every variant is emitted at the same pixel dimensions by
 * `scripts/generate-pwa-assets.mjs`, so the explicit `width`/`height` stay
 * valid no matter which format the browser picks — the box is reserved up front
 * and the image never shifts layout (CLS-safe).
 *
 * Below-the-fold usage should pass `loading="lazy"`; an LCP/hero image should
 * pass `loading="eager"` + `fetchpriority="high"` (and be preloaded in
 * `<head>`). Those attributes flow straight through to the `<img>`.
 */
export const Picture = forwardRef<HTMLImageElement, PictureProps>(function Picture(
  {
    sources,
    src,
    fallbackSrcSet,
    alt,
    width,
    height,
    sizes,
    pictureClassName,
    className,
    decoding = 'async',
    ...imgProps
  },
  ref,
) {
  return (
    <picture className={pictureClassName}>
      {sources.map((source) => (
        <source
          key={source.type}
          type={source.type}
          srcSet={source.srcSet}
          sizes={sizes}
        />
      ))}
      <img
        ref={ref}
        src={src}
        srcSet={fallbackSrcSet}
        sizes={sizes}
        alt={alt}
        width={width}
        height={height}
        decoding={decoding}
        className={cn(className)}
        {...imgProps}
      />
    </picture>
  );
});
