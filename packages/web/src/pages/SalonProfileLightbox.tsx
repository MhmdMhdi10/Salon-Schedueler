import { useTranslation } from 'react-i18next';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { IconButton } from '../components/ui/IconButton';
import { ImageCarousel } from '../components/ui/ImageCarousel';
import type { CarouselImage } from '../components/ui/ImageCarousel';
import { cn } from '../components/ui/cn';
import type { SalonProfile } from '../data/salons';

/**
 * Full-screen gallery lightbox built directly on Radix Dialog (focus trap,
 * `Esc` + overlay close) around the shared `ImageCarousel` (RTL-safe track,
 * keyboard arrows, swipe). Motion: token-timed fade/scale keyframes gated by
 * `motion-safe:`; reduced motion falls back to opacity.
 */
export default function GalleryLightbox({
  salon,
  openAt,
  onClose,
}: {
  salon: SalonProfile;
  openAt: number | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const images: CarouselImage[] = salon.gallery.map((image) => ({
    src: image.src,
    alt: image.alt,
    width: image.width,
    height: image.height,
  }));

  return (
    <RadixDialog.Root open={openAt !== null} onOpenChange={(open) => !open && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className={cn(
            'fixed inset-0 z-overlay bg-overlay',
            'motion-safe:data-[state=open]:animate-fade-in',
            'motion-safe:data-[state=closed]:animate-fade-out',
          )}
        />
        <RadixDialog.Content
          aria-modal="true"
          className={cn(
            'fixed inset-0 z-dialog m-auto h-fit w-[calc(100%-var(--space-8))] max-w-4xl',
            'rounded-lg outline-none',
            'motion-safe:data-[state=open]:animate-scale-in',
            'motion-safe:data-[state=closed]:animate-fade-out',
          )}
        >
          <RadixDialog.Title className="sr-only">
            {t('salon.profile.lightboxTitle', { name: salon.name })}
          </RadixDialog.Title>
          <RadixDialog.Description className="sr-only">
            {t('salon.profile.galleryAria', { name: salon.name })}
          </RadixDialog.Description>
          <ImageCarousel
            images={images}
            eagerFirst={false}
            initialIndex={openAt ?? 0}
            className="aspect-video w-full overflow-hidden rounded-lg bg-ink"
          />
          <RadixDialog.Close asChild>
            <IconButton
              aria-label={t('common.close', 'بستن')}
              variant="ghost"
              className="absolute -top-12 end-0 h-10 min-h-0 w-10 min-w-0 text-ink-contrast hover:text-ink-contrast"
            >
              <X className="h-5 w-5" />
            </IconButton>
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
