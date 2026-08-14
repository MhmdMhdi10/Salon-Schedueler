import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { normalizeDigits } from '@salon/shared';
import { cn, toPersianDigits } from '../components/ui';
import { durations } from '../lib/motion-variants';

/** Number of digits in the SMS one-time code. */
export const OTP_LENGTH = 6;

export interface OtpInputHandle {
  /** Focus the first empty box (or the last box when all are filled). */
  focus: () => void;
}

export interface OtpInputProps {
  /** The current per-box digits (length {@link OTP_LENGTH}, '' = empty). */
  value: string[];
  /** Called with the full next digits array on any entry/paste/clear. */
  onChange: (next: string[]) => void;
  /** Marks the boxes invalid (danger border + one-time shake). */
  invalid?: boolean;
  /** id of the error element announced for the boxes (`aria-describedby`). */
  describedBy?: string;
  /** Focus the first box when the component mounts. */
  autoFocus?: boolean;
  disabled?: boolean;
}

/**
 * Six-box one-time-code entry shared by the OTP login page and the salon
 * registration wizard.
 *
 * Robust against every real entry mode (the previous per-box `maxLength={1}`
 * pattern silently swallowed digits typed faster than React could move focus,
 * and truncated OS one-time-code autofill to a single digit):
 *
 *  - **Fast typing / autofill**: no `maxLength` — any multi-character change is
 *    normalized (Persian digits → Latin) and distributed forward across the
 *    boxes exactly like a paste, so a whole 6-digit autofill into box 1 fills
 *    all six boxes.
 *  - **Paste**: distributed from the pasted-into box, focus lands on the next
 *    empty box.
 *  - **Backspace** in an empty box clears + focuses the previous box; physical
 *    Arrow keys move between boxes (the row is LTR, so arrows match visually).
 *
 * The row is cascade-proofed LTR (`dir` attribute + inline `direction` +
 * `unicode-bidi: isolate`) so reading order always equals index order under the
 * app's RTL document — do NOT remove the inline style (see the otp-order
 * regression tests).
 *
 * On `invalid` becoming true the row does a one-time transform shake (skipped
 * under `prefers-reduced-motion`, where the danger border alone signals it).
 */
export const OtpInput = forwardRef<OtpInputHandle, OtpInputProps>(function OtpInput(
  { value, onChange, invalid, describedBy, autoFocus, disabled },
  ref,
) {
  const { t } = useTranslation();
  const boxRefs = useRef<Array<HTMLInputElement | null>>([]);
  const prefersReduced = useReducedMotion();
  const shakeControls = useAnimationControls();
  const wasInvalid = useRef(false);

  const focusBox = (index: number) => {
    const el = boxRefs.current[Math.max(0, Math.min(index, OTP_LENGTH - 1))];
    el?.focus();
    el?.select?.();
  };

  useImperativeHandle(ref, () => ({
    focus: () => {
      const firstEmpty = value.findIndex((d) => !d);
      focusBox(firstEmpty === -1 ? OTP_LENGTH - 1 : firstEmpty);
    },
  }));

  useEffect(() => {
    if (autoFocus) focusBox(0);
    // mount-only
  }, []);

  // One-time shake on the rising edge of `invalid` (transform-only; reduced
  // motion falls back to the danger border color alone).
  useEffect(() => {
    if (invalid && !wasInvalid.current && !prefersReduced) {
      void shakeControls.start({
        x: [0, -6, 6, -4, 4, 0],
        transition: { duration: durations.slow, ease: 'easeOut' },
      });
    }
    wasInvalid.current = Boolean(invalid);
  }, [invalid, prefersReduced, shakeControls]);

  /**
   * Applies raw entered text at `index`: normalizes digits and distributes
   * them forward (typing, autofill and paste all converge here), then moves
   * focus to the next empty box.
   */
  const applyDigits = (index: number, raw: string) => {
    let digits = normalizeDigits(raw).replace(/\D/g, '');
    if (!digits) {
      const next = [...value];
      next[index] = '';
      onChange(next);
      return;
    }
    // Typing into an already-filled box: the change event carries old+new —
    // strip the previous digit so only the newly typed one(s) distribute.
    const prev = value[index];
    if (prev && digits.length > 1) {
      if (digits.startsWith(prev)) digits = digits.slice(prev.length);
      else if (digits.endsWith(prev)) digits = digits.slice(0, -prev.length);
    }
    digits = digits.slice(0, OTP_LENGTH - index);
    const next = [...value];
    for (let i = 0; i < digits.length; i += 1) next[index + i] = digits[i];
    onChange(next);
    focusBox(index + digits.length);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      e.preventDefault();
      const next = [...value];
      next[index - 1] = '';
      onChange(next);
      focusBox(index - 1);
      return;
    }
    // The row is visually LTR, so physical arrows match reading order.
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      e.preventDefault();
      focusBox(index + 1);
    }
  };

  return (
    /* The EXPLICIT inline `direction: ltr` + `unicode-bidi: isolate`
       cascade-proofs this row against inherited RTL from `<html dir="rtl">`,
       guaranteeing reading order == index order (index 0 = leftmost box) so
       `value.join('')` submits digits in the order the user sees them. */
    <motion.div
      className="flex flex-row justify-center gap-1 sm:gap-2"
      dir="ltr"
      style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
      animate={shakeControls}
    >
      {value.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            boxRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          dir="ltr"
          disabled={disabled}
          aria-label={t('auth.otpDigitLabel', { index: toPersianDigits(index + 1) })}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? describedBy : undefined}
          value={digit}
          onChange={(e) => applyDigits(index, e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text');
            if (!pasted) return;
            e.preventDefault();
            applyDigits(index, pasted);
          }}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => handleKeyDown(index, e)}
          className={cn(
            'h-11 w-9 rounded-md border bg-bg text-center text-lg font-bold text-text',
            'sm:h-12 sm:w-11',
            'transition-colors duration-fast ease-standard',
            'outline-none focus-visible:outline focus-visible:outline-2',
            'focus-visible:outline-offset-2 focus-visible:outline-focus',
            'disabled:cursor-not-allowed disabled:opacity-60',
            invalid ? 'border-danger' : 'border-border',
          )}
          style={{ unicodeBidi: 'isolate' }}
        />
      ))}
    </motion.div>
  );
});
