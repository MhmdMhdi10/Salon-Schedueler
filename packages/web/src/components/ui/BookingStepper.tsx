import { motion, useReducedMotion } from 'framer-motion';
import { cn } from './cn';
import { toPersianDigits } from './Num';
import { easings } from '../../lib/motion-variants';

export interface BookingStep {
  /** Unique identifier for the step. */
  key: string;
  /** Persian display label (e.g. «خدمت», «تاریخ», «زمان», «تایید»). */
  label: string;
}

export interface BookingStepperProps {
  /** Ordered list of steps with Persian labels. */
  steps: BookingStep[];
  /** Current active step index (0-based). */
  currentStep: number;
  /** Additional class names for the root container. */
  className?: string;
}

/**
 * Horizontal progress stepper for the booking funnel.
 *
 * Renders a row of numbered step circles connected by lines, flowing
 * right-to-left (inherits document RTL via `dir`). Each step displays
 * a Persian numeral inside its circle with a label below.
 *
 * Visual states:
 * - **Completed**: filled primary circle with animated checkmark + solid connector
 * - **Current/Active**: filled primary circle with step number + pulse indicator
 * - **Upcoming**: outlined muted circle with step number + dashed connector
 *
 * Accessibility:
 * - `role="list"` on the container, `role="listitem"` on each step
 * - `aria-current="step"` on the active step
 *
 * Animations (Framer Motion, respects `prefers-reduced-motion`):
 * - Circle fills with primary color on completion (scale-in)
 * - Checkmark draws in via SVG pathLength
 * - Current step has a subtle pulse ring
 * - Connector line draws from start to end on completion
 *
 * Touch targets: circles are ≥ 44px for accessibility compliance.
 * All colors derived from tokens (`primary`, `muted`, `border`).
 */
export function BookingStepper({ steps, currentStep, className }: BookingStepperProps) {
  const prefersReduced = useReducedMotion();

  return (
    <nav aria-label="مراحل رزرو" className={cn('w-full', className)}>
      <ol role="list" className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isUpcoming = index > currentStep;

          return (
            <li
              key={step.key}
              role="listitem"
              aria-current={isCurrent ? 'step' : undefined}
              className="flex flex-1 items-center"
            >
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative flex items-center justify-center">
                  {/* Pulse ring for current step */}
                  {isCurrent && !prefersReduced && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-primary"
                      animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                      aria-hidden="true"
                    />
                  )}

                  {/* Circle */}
                  <motion.div
                    className={cn(
                      'relative z-10 flex h-11 w-11 items-center justify-center rounded-full',
                      'text-sm font-bold transition-colors',
                      isCompleted && 'bg-primary text-primary-contrast',
                      isCurrent && 'bg-primary text-primary-contrast',
                      isUpcoming && 'border-2 border-border text-muted bg-surface',
                    )}
                    initial={false}
                    animate={
                      prefersReduced ? {} : isCompleted || isCurrent ? { scale: 1 } : { scale: 1 }
                    }
                    transition={{ duration: 0.3, ease: easings.standard }}
                  >
                    {isCompleted ? (
                      /* Checkmark for completed steps */
                      <motion.svg
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="none"
                        aria-hidden="true"
                      >
                        <motion.path
                          d="M4 10.5L8 14.5L16 6.5"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          initial={prefersReduced ? { pathLength: 1 } : { pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.3, delay: 0.1, ease: easings.standard }}
                        />
                      </motion.svg>
                    ) : (
                      /* Persian numeral for current/upcoming */
                      <bdi className="tabular-nums [font-feature-settings:'tnum']">
                        {toPersianDigits(index + 1)}
                      </bdi>
                    )}
                  </motion.div>
                </div>

                {/* Label */}
                <span
                  className={cn(
                    'text-xs whitespace-nowrap',
                    isCompleted && 'text-primary font-medium',
                    isCurrent && 'text-primary font-bold',
                    isUpcoming && 'text-muted',
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line (not rendered after the last step) */}
              {index < steps.length - 1 && (
                <div className="relative mx-2 flex-1 self-start mt-[22px]">
                  {/* Background track (always visible) */}
                  <div
                    className={cn(
                      'h-0.5 w-full',
                      index < currentStep ? 'bg-primary' : 'border-t-2 border-dashed border-border',
                    )}
                    aria-hidden="true"
                  />

                  {/* Animated fill overlay for completed connectors */}
                  {index < currentStep && !prefersReduced && (
                    <motion.div
                      className="absolute inset-y-0 start-0 h-0.5 bg-primary"
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{
                        duration: 0.4,
                        delay: 0.1,
                        ease: easings.standard,
                      }}
                      aria-hidden="true"
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
