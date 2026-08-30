/**
 * Barrel export for the accessible UI component library (`components/ui`).
 *
 * Primitives are token-driven (Tailwind classes that resolve to CSS variables),
 * RTL-first (logical properties), and accessible by default. See
 * `.kiro/steering/ui-ux-skills.md` for the governing standards.
 */

// Utilities
export { cn } from './cn';
export type { ClassValue } from './cn';

// Buttons
export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
export { IconButton } from './IconButton';
export type { IconButtonProps } from './IconButton';

// Feedback
export { Spinner } from './Spinner';
export type { SpinnerProps, SpinnerSize } from './Spinner';

// Form fields
export { TextField } from './TextField';
export type { TextFieldProps } from './TextField';
export { Textarea } from './Textarea';
export type { TextareaProps } from './Textarea';
export { Select } from './Select';
export type { SelectProps, SelectOption } from './Select';
export { Checkbox } from './Checkbox';
export type { CheckboxProps } from './Checkbox';
export { RadioGroup } from './RadioGroup';
export type { RadioGroupProps, RadioOption } from './RadioGroup';
export { Switch } from './Switch';
export type { SwitchProps } from './Switch';

// Overlays
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogPortal,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './Dialog';
export type { DialogContentProps } from './Dialog';
export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from './Sheet';
export type { SheetContentProps, SheetSide } from './Sheet';
export { Tooltip, TooltipProvider } from './Tooltip';
export type { TooltipProps } from './Tooltip';

// Navigation
export { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';

// Display & layout
export { Card, CardHeader, CardTitle, CardContent, CardFooter } from './Card';
export type { CardProps } from './Card';
export { Skeleton } from './Skeleton';
export type { SkeletonProps, SkeletonVariant } from './Skeleton';
export { Avatar } from './Avatar';
export type { AvatarProps, AvatarSize } from './Avatar';
export { Picture } from './Picture';
export type { PictureProps, PictureSource } from './Picture';
export { Rating } from './Rating';
export type { RatingProps } from './Rating';
export { RatingStars } from './RatingStars';
export type { RatingStarsProps, RatingStarsSize } from './RatingStars';
export { SalonCard, SalonListCard } from './SalonCard';
export type { SalonCardProps, SalonListCardProps } from './SalonCard';
export { SalonPlaceholder } from './SalonPlaceholder';
export type { SalonPlaceholderProps } from './SalonPlaceholder';
export { PageTransition } from './Motion';
export type { PageTransitionProps } from './Motion';
export { ScrollReveal } from './ScrollReveal';
export type { ScrollRevealProps } from './ScrollReveal';
export { StaggerContainer, StaggerItem } from './StaggerContainer';
export type { StaggerContainerProps, StaggerItemProps } from './StaggerContainer';
export { CelebrationRing, ConfettiParticles } from './Celebration';
export { ParallaxHero } from './ParallaxHero';
export type { ParallaxHeroProps } from './ParallaxHero';
export { AnimatedCounter } from './AnimatedCounter';
export type { AnimatedCounterProps } from './AnimatedCounter';
export { FilterBar } from './FilterBar';
export type { FilterBarProps, SortOption } from './FilterBar';
export { Pagination } from './Pagination';
export type { PaginationProps } from './Pagination';
export { CategoryBrowser } from './CategoryBrowser';
export type { CategoryBrowserProps, CategoryBrowserVariant } from './CategoryBrowser';
export { ImageCarousel } from './ImageCarousel';
export type { ImageCarouselProps, CarouselImage } from './ImageCarousel';
export { BookingStepper } from './BookingStepper';
export type { BookingStepperProps, BookingStep } from './BookingStepper';
export { BookingFlowTransition } from './BookingFlowTransition';
export type { BookingFlowTransitionProps } from './BookingFlowTransition';
export { ServiceCardList } from './ServiceCardList';
export type { ServiceCardListProps, ServiceCardItem } from './ServiceCardList';

// Persian formatting & bidi helpers (display-only localization, R7.2–7.5)
export { Num, toPersianDigits } from './Num';
export type { NumProps } from './Num';
export { Money, formatRial, formatToman } from './Money';
export type { MoneyProps, MoneyUnit } from './Money';
export { JalaliDate, formatJalaliDisplay } from './JalaliDate';
export type { JalaliDateProps, JalaliDateStyle } from './JalaliDate';
export { DirText } from './DirText';
export type { DirTextProps } from './DirText';

// Date & time selection
export { JalaliDatePicker } from './JalaliDatePicker';
export type { JalaliDatePickerProps, JalaliDatePickerVariant } from './JalaliDatePicker';
export { MobileDatePicker } from './MobileDatePicker';
export type { MobileDatePickerProps } from './MobileDatePicker';
export { SlotGrid, SlotChip } from './SlotGrid';
export type { SlotGridProps, SlotChipProps, SlotItem, SlotState } from './SlotGrid';
export { DayScroller } from './DayScroller';
export type { DayScrollerProps, DayScrollerItem } from './DayScroller';

// Status & feedback
export { Badge } from './Badge';
export type { BadgeProps, BadgeStatus } from './Badge';
export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';
export { ErrorState } from './ErrorState';
export type { ErrorStateProps } from './ErrorState';
export { ToastProvider, useToast } from './Toast';
export type { ToastProviderProps, ToastOptions, ToastStatus } from './Toast';
