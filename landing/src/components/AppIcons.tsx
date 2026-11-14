/**
 * Hand-drawn equivalents of the Ionicons the app uses (no icon package).
 * 24px grid, outline style at ~1.6 stroke like Ionicons' "-outline" set.
 */
type IconProps = { size?: number; color?: string; className?: string };

function Svg({
  size = 24,
  color = 'currentColor',
  className,
  children,
  fill = 'none',
  strokeWidth = 1.7,
}: IconProps & { children: React.ReactNode; fill?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={fill === 'none' ? color : 'none'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={fill === 'none' ? undefined : { color }}
    >
      {children}
    </svg>
  );
}

export const HomeFilled = (p: IconProps) => (
  <Svg {...p} fill={p.color ?? 'currentColor'}>
    <path d="M12 2.8 2.6 10.6a.9.9 0 0 0 1.15 1.38L5 10.95V20a1 1 0 0 0 1 1h4.25v-5.75h3.5V21H18a1 1 0 0 0 1-1v-9.05l1.25 1.03a.9.9 0 0 0 1.15-1.38z" />
  </Svg>
);

export const CompassOutline = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.6 8.4-2.2 5-5 2.2 2.2-5z" />
  </Svg>
);

export const BookOutline = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 6.6C10 5 7 4.4 3.5 4.8v13.6c3.5-.4 6.5.2 8.5 1.8 2-1.6 5-2.2 8.5-1.8V4.8C17 4.4 14 5 12 6.6z" />
    <path d="M12 6.6v13.6" />
  </Svg>
);

export const StorefrontOutline = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 11v9h15v-9" />
    <path d="M3.6 4h16.8l1.4 4.6a2.45 2.45 0 0 1-4.9.4 2.45 2.45 0 0 1-4.9 0 2.45 2.45 0 0 1-4.9 0 2.45 2.45 0 0 1-4.9-.4z" />
    <path d="M10 20v-4.5h4V20" />
  </Svg>
);

export const PersonOutline = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="7.8" r="4" />
    <path d="M4.2 20.5c.9-4 4-6.2 7.8-6.2s6.9 2.2 7.8 6.2" />
  </Svg>
);

export const Add = (p: IconProps & { strokeWidth?: number }) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const NotificationsOutline = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 16.4V11a6 6 0 0 0-12 0v5.4L4.4 18h15.2z" />
    <path d="M9.8 20.6a2.3 2.3 0 0 0 4.4 0" />
  </Svg>
);

export const ChatbubblesOutline = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16.2 9.6c0-3-2.9-5.3-6.6-5.3S3 6.6 3 9.6c0 1.5.7 2.8 1.9 3.8L4.4 16l2.9-1.5c.7.2 1.5.3 2.3.3 3.7 0 6.6-2.3 6.6-5.2z" />
    <path d="M18.6 9.3c1.5.9 2.4 2.3 2.4 3.9 0 1.2-.5 2.3-1.4 3.1l.4 2.7-2.7-1.4a8 8 0 0 1-2 .3c-1.9 0-3.6-.7-4.7-1.8" />
  </Svg>
);

export const PlayCircleOutline = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.6v6.8l5.6-3.4z" />
  </Svg>
);

export const Checkmark = (p: IconProps & { strokeWidth?: number }) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.6}>
    <path d="m5 12.6 4.4 4.4L19 7.4" />
  </Svg>
);

export const ChevronDown = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.4}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const ChevronUp = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.4}>
    <path d="m6 15 6-6 6 6" />
  </Svg>
);

export const ChevronForward = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.4}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

export const HeartOutline = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20.2s-7.6-4.6-9-9.6C2 6.9 4.4 4.3 7.3 4.3c2 0 3.6 1.1 4.7 2.8 1.1-1.7 2.7-2.8 4.7-2.8 2.9 0 5.3 2.6 4.3 6.3-1.4 5-9 9.6-9 9.6z" />
  </Svg>
);

export const ChatbubbleOutline = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.9c-5 0-9 3.4-9 7.6 0 2.1 1 4 2.7 5.4L5 20.7l4.2-2c.9.3 1.8.4 2.8.4 5 0 9-3.4 9-7.6s-4-7.6-9-7.6z" />
  </Svg>
);

export const PaperPlaneOutline = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 3 10.2 13.8M21 3l-6.8 18-4-7.2L3 9.8z" />
  </Svg>
);

export const EllipsisHorizontal = (p: IconProps) => (
  <Svg {...p} fill={p.color ?? 'currentColor'}>
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </Svg>
);
