import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import { Clock } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './Dialog';
import { Num } from './Num';

const TIME_WHEEL_ITEM_HEIGHT = 44;

function setTimeWheelPosition(element: HTMLDivElement | null, index: number) {
  if (!element) return;
  const top = index * TIME_WHEEL_ITEM_HEIGHT;
  if (typeof element.scrollTo === 'function') {
    element.scrollTo({ top, behavior: 'auto' });
  } else {
    element.scrollTop = top;
  }
}

export function TimeWheelField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(Number(value.split(':')[0] ?? 0));
  const [minute, setMinute] = useState(Number(value.split(':')[1] ?? 0));
  const selectedHourRef = useRef(hour);
  const selectedMinuteRef = useRef(minute);
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, index) => index), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, index) => index), []);

  useLayoutEffect(() => {
    if (!open) return;
    const nextHour = Number(value.split(':')[0] ?? 0);
    const nextMinute = Number(value.split(':')[1] ?? 0);
    selectedHourRef.current = nextHour;
    selectedMinuteRef.current = nextMinute;
    setHour(nextHour);
    setMinute(nextMinute);
    setTimeWheelPosition(hourRef.current, nextHour);
    setTimeWheelPosition(minuteRef.current, nextMinute);
  }, [open, value]);

  const wheel = (
    values: number[],
    selected: number,
    setSelected: (value: number) => void,
    ref: RefObject<HTMLDivElement>,
    selectedRef: MutableRefObject<number>,
    ariaLabel: string,
  ) => (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-bg shadow-inner">
      <div className="pointer-events-none absolute inset-x-2 top-1/2 z-10 h-11 -translate-y-1/2 rounded-xl border border-primary/40 bg-primary/15 shadow-[0_0_24px_rgb(var(--color-primary-rgb)/0.12)]" />
      <div
        ref={ref}
        role="listbox"
        aria-label={ariaLabel}
        className="h-[220px] snap-y snap-mandatory overflow-y-auto overscroll-contain py-[88px] [mask-image:linear-gradient(to_bottom,transparent,black_25%,black_75%,transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          const index = Math.max(
            0,
            Math.min(values.length - 1, Math.round(event.currentTarget.scrollTop / TIME_WHEEL_ITEM_HEIGHT)),
          );
          const nextValue = values[index];
          selectedRef.current = nextValue;
          setSelected(nextValue);
        }}
      >
        {values.map((item) => (
          <button
            type="button"
            role="option"
            aria-selected={selected === item}
            aria-label={String(item).padStart(2, '0')}
            key={item}
            className={cn(
              'relative z-20 flex h-11 w-full snap-center items-center justify-center text-xl tabular-nums transition-all',
              selected === item ? 'scale-110 font-black text-text' : 'scale-90 text-muted/45',
            )}
            onClick={() => {
              selectedRef.current = item;
              setSelected(item);
              setTimeWheelPosition(ref.current, item);
            }}
          >
            <Num value={String(item).padStart(2, '0')} />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted">
        {label}
        <button
          type="button"
          dir="ltr"
          aria-label={`${label} ${value}`}
          disabled={disabled}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-bg px-3 text-base font-black tabular-nums text-text shadow-sm transition hover:border-primary/60 hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => setOpen(true)}
        >
          <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
          <Num value={value} />
        </button>
      </label>
      <Dialog open={open} onOpenChange={(nextOpen) => !disabled && setOpen(nextOpen)}>
        <DialogContent className="!w-[min(400px,calc(100vw-24px))] !max-w-none overflow-hidden rounded-2xl p-6">
          <DialogTitle className="text-center text-xl">{label}</DialogTitle>
          <DialogDescription className="text-center">برای انتخاب، ساعت و دقیقه را بالا یا پایین بکش.</DialogDescription>
          <div className="relative mx-auto mt-5 grid max-w-[19rem] grid-cols-[1fr_auto_1fr] items-center gap-3" dir="ltr">
            {wheel(hours, hour, setHour, hourRef, selectedHourRef, 'ساعت')}
            <span className="text-2xl font-black text-muted">:</span>
            {wheel(minutes, minute, setMinute, minuteRef, selectedMinuteRef, 'دقیقه')}
          </div>
          <div className="mt-5 flex justify-center gap-2">
            <DialogClose asChild>
              <Button variant="ghost">انصراف</Button>
            </DialogClose>
            <Button
              variant="primary"
              disabled={disabled}
              onClick={() => {
                onChange(
                  `${String(selectedHourRef.current).padStart(2, '0')}:${String(selectedMinuteRef.current).padStart(2, '0')}`,
                );
                setOpen(false);
              }}
            >
              تأیید ساعت
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
