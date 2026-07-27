import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from './cn';

/* ─── Types ────────────────────────────────────────────────────────────── */

export interface CarouselImage {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface ImageCarouselProps {
  /** Array of image objects to display in the carousel. */
  images: CarouselImage[];
  /** Optional additional class names for the root container. */
  className?: string;
  /**
   * When true (default), the first image uses `loading="eager"` and
   * `fetchpriority="high"` for LCP optimization. Subsequent images lazy-load.
   */
  eagerFirst?: boolean;
  /** Slide index to start on (e.g. a lightbox opening at a tapped tile). */
  initialIndex?: number;
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

/** Returns true if the document direction is RTL. */
function isRtl(): boolean {
  if (typeof document === 'undefined') return true; // Default to RTL (Persian app)
  return (
    document.documentElement.dir === 'rtl' ||
    getComputedStyle(document.documentElement).direction === 'rtl'
  );
}

/* ─── Component ────────────────────────────────────────────────────────── */

/**
 * Swipeable image carousel for salon profile hero sections.
 *
 * Features:
 * - Drag/swipe gestures via Framer Motion `drag="x"` with elastic constraints
 * - Navigation dots indicating current slide (focusable buttons)
 * - Prev/next arrow buttons mirrored for RTL (logical start/end positioning)
 * - First image eager-loaded as LCP; subsequent images lazy
 * - Keyboard accessible: arrow keys navigate slides
 * - Full ARIA carousel pattern (`aria-roledescription="carousel"`)
 * - Under reduced motion: disables drag animation, uses instant transitions
 * - Only animates compositor-friendly properties (transform/opacity)
 *
 * **Validates: Requirements 6.1, 9.3, 9.4, 12.3**
 */
export function ImageCarousel({
  images,
  className,
  eagerFirst = true,
  initialIndex = 0,
}: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.max(0, Math.min(initialIndex, images.length - 1)),
  );
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  // Measure container width for slide offset calculation
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const measure = () => setContainerWidth(node.offsetWidth);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const slideCount = images.length;
  const rtl = isRtl();

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, slideCount - 1));
      setCurrentIndex(clamped);
    },
    [slideCount],
  );

  const goNext = useCallback(() => goTo(currentIndex + 1), [currentIndex, goTo]);
  const goPrev = useCallback(() => goTo(currentIndex - 1), [currentIndex, goTo]);

  // Keyboard navigation for the carousel container
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowLeft') {
        // In RTL: ArrowLeft = next (towards inline-end)
        // In LTR: ArrowLeft = prev
        e.preventDefault();
        rtl ? goNext() : goPrev();
      } else if (e.key === 'ArrowRight') {
        // In RTL: ArrowRight = prev (towards inline-start)
        // In LTR: ArrowRight = next
        e.preventDefault();
        rtl ? goPrev() : goNext();
      }
    },
    [rtl, goNext, goPrev],
  );

  // Calculate the translate offset for the current slide. The slide track is
  // forced LTR (`direction: 'ltr'` below), so slides always overflow to the
  // RIGHT regardless of the document direction — the offset is therefore
  // always negative. (A positive offset in RTL would translate the track away
  // from the slides and reveal blank frames; only the arrow/keyboard mapping
  // differs per direction, handled above.)
  const offset = -(currentIndex * containerWidth);

  // Drag constraints: how far the (always-LTR) track can be dragged.
  const maxDrag = (slideCount - 1) * containerWidth;
  const dragConstraints = { left: -maxDrag, right: 0 };

  // Handle drag end: snap to nearest slide
  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
      const swipeThreshold = containerWidth * 0.2;
      const velocityThreshold = 200;

      const dragOffset = info.offset.x;
      const velocity = info.velocity.x;

      let direction = 0;
      if (Math.abs(dragOffset) > swipeThreshold || Math.abs(velocity) > velocityThreshold) {
        // In RTL: dragging right (positive x) = go to previous
        //         dragging left (negative x) = go to next
        // In LTR: dragging left (negative x) = go to next
        //         dragging right (positive x) = go to previous
        if (rtl) {
          direction = dragOffset > 0 ? -1 : 1;
        } else {
          direction = dragOffset < 0 ? 1 : -1;
        }
      }

      goTo(currentIndex + direction);
    },
    [containerWidth, currentIndex, goTo, rtl],
  );

  if (slideCount === 0) return null;

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden', className)}
      role="region"
      aria-roledescription="carousel"
      aria-label="گالری تصاویر"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Slide track */}
      <motion.div
        className="flex"
        style={{ direction: 'ltr' }} // Internal track always LTR; we control offset
        drag={prefersReduced ? false : 'x'}
        dragConstraints={prefersReduced ? undefined : dragConstraints}
        dragElastic={0.1}
        onDragEnd={prefersReduced ? undefined : handleDragEnd}
        animate={{ x: offset }}
        transition={
          prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 30 }
        }
      >
        {images.map((img, i) => (
          <div
            key={`${img.src}-${i}`}
            className="min-w-full"
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} از ${slideCount}`}
            aria-hidden={i !== currentIndex}
          >
            <img
              src={img.src}
              alt={img.alt}
              width={img.width ?? 1280}
              height={img.height ?? 720}
              loading={eagerFirst && i === 0 ? 'eager' : 'lazy'}
              className="h-full w-full object-cover select-none"
              draggable={false}
              {...(eagerFirst && i === 0 ? { fetchpriority: 'high' as const } : {})}
            />
          </div>
        ))}
      </motion.div>

      {/* Scrim overlay for text legibility */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-bg/60 to-transparent pointer-events-none"
        aria-hidden="true"
      />

      {/* Prev/Next arrows — only show when there are multiple slides */}
      {slideCount > 1 && (
        <>
          {/* Previous arrow (inline-start side) */}
          <button
            type="button"
            onClick={goPrev}
            disabled={currentIndex === 0}
            aria-label="تصویر قبلی"
            className={cn(
              'absolute top-1/2 -translate-y-1/2',
              'start-3',
              'flex h-10 w-10 items-center justify-center',
              'rounded-full bg-elevated/80 text-text shadow-1',
              'backdrop-blur-sm',
              'transition-opacity duration-fast ease-standard',
              'hover:bg-elevated active:brightness-95',
              'focus-visible:outline focus-visible:outline-2',
              'focus-visible:outline-offset-2 focus-visible:outline-focus',
              'disabled:opacity-0 disabled:pointer-events-none',
            )}
          >
            {/* Chevron pointing towards inline-start (prev direction).
                In RTL: points right; In LTR: points left.
                Using a simple SVG chevron that gets mirrored by RTL. */}
            <svg
              className="h-5 w-5 rtl:rotate-0 ltr:rotate-180"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {/* Next arrow (inline-end side) */}
          <button
            type="button"
            onClick={goNext}
            disabled={currentIndex === slideCount - 1}
            aria-label="تصویر بعدی"
            className={cn(
              'absolute top-1/2 -translate-y-1/2',
              'end-3',
              'flex h-10 w-10 items-center justify-center',
              'rounded-full bg-elevated/80 text-text shadow-1',
              'backdrop-blur-sm',
              'transition-opacity duration-fast ease-standard',
              'hover:bg-elevated active:brightness-95',
              'focus-visible:outline focus-visible:outline-2',
              'focus-visible:outline-offset-2 focus-visible:outline-focus',
              'disabled:opacity-0 disabled:pointer-events-none',
            )}
          >
            {/* Chevron pointing towards inline-end (next direction).
                In RTL: points left; In LTR: points right. */}
            <svg
              className="h-5 w-5 rtl:rotate-180 ltr:rotate-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </>
      )}

      {/* Navigation dots */}
      {slideCount > 1 && (
        <div
          className="absolute bottom-3 start-0 end-0 flex justify-center gap-2"
          role="tablist"
          aria-label="انتخاب تصویر"
        >
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === currentIndex}
              aria-label={`تصویر ${i + 1}`}
              onClick={() => goTo(i)}
              className={cn(
                'h-2 rounded-pill transition-all duration-base ease-standard',
                'focus-visible:outline focus-visible:outline-2',
                'focus-visible:outline-offset-2 focus-visible:outline-focus',
                i === currentIndex
                  ? 'w-6 bg-primary-contrast'
                  : 'w-2 bg-primary-contrast/50 hover:bg-primary-contrast/75',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
