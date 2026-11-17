/**
 * Grow! mark drawn as inline SVG (traced by eye from docs/brand/mark-master.png):
 * a leaf with a curled slit, sitting in a smile arc whose tail turns it into a "g".
 * Coordinates are in the master's 1024px space; the viewBox crops to the mark.
 */
export const MARK_VIEWBOX = '280 190 470 640';

export const LEAF_PATH =
  'M400 545C360 490 340 400 400 320C450 255 530 215 600 215C660 215 680 280 665 340C640 460 580 570 485 605C465 610 455 580 455 540C455 470 480 420 535 378C470 395 410 450 400 545Z';

/** Smile arc (stroked). */
export const SMILE_PATH = 'M325 615C362 724 432 797 512 798C612 800 690 722 714 632';

/** Inner tail of the "g" (stroked). */
export const TAIL_PATH = 'M700 625C640 646 560 652 492 642';

/** Where the leaf meets the arc; used as the transform origin for sprout animations. */
export const LEAF_BASE = { x: 470, y: 600 };

export function SeedMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="none"
    >
      <path d={LEAF_PATH} fill="currentColor" />
      <path d={SMILE_PATH} stroke="currentColor" strokeWidth={66} strokeLinecap="round" />
      <path d={TAIL_PATH} stroke="currentColor" strokeWidth={40} strokeLinecap="round" />
    </svg>
  );
}

/** Wordmark lockup: mark + "Grow!" set in the display face. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <SeedMark className="h-7 w-auto text-leaf" />
      <span className="font-display text-[1.375rem] font-extrabold tracking-[-0.02em] text-bark">
        Grow!
      </span>
    </span>
  );
}
