/**
 * Static parts of the app's Home screen, drawn in HTML/CSS for the hero phone.
 * Mirrors frontend/: GrowChromeHeader + Feed header buttons (FeedScreen.tsx),
 * the Stories row, FeedPostCard and the floating dock (IndividualTabs.tsx).
 * Purely visual — the only interactive part is the Today card (CheckInDemo).
 */
import { LEAF_PATH, MARK_VIEWBOX, SMILE_PATH, TAIL_PATH } from './brand';
import type { DemoArt, ReplyKind } from './CheckInDemo';
import {
  Add,
  BookOutline,
  Checkmark,
  ChevronDown,
  ChevronForward,
  ChevronUp,
  ChatbubbleOutline,
  ChatbubblesOutline,
  CompassOutline,
  EllipsisHorizontal,
  HeartOutline,
  HomeFilled,
  NotificationsOutline,
  PaperPlaneOutline,
  PersonOutline,
  PlayCircleOutline,
  StorefrontOutline,
} from './AppIcons';

const BRAND = '#059669';

/** The app icon: cream seed mark on emerald, rounded like assets/icon.png in the header. */
export function AppIconMark({ size = 26 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center overflow-hidden"
      style={{ width: size, height: size, borderRadius: size * 0.27, background: BRAND }}
      aria-hidden="true"
    >
      <svg viewBox={MARK_VIEWBOX} style={{ height: size * 0.72 }} fill="none">
        <path d={LEAF_PATH} fill="#F3EEE4" />
        <path d={SMILE_PATH} stroke="#F3EEE4" strokeWidth={66} strokeLinecap="round" />
        <path d={TAIL_PATH} stroke="#F3EEE4" strokeWidth={40} strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function StatusBar() {
  return (
    <div className="flex h-[50px] items-center justify-between bg-[#F3EEE4] px-7 pt-1" aria-hidden="true">
      <span className="w-[54px] text-[15px] font-semibold tracking-[-0.01em] text-stone-900">9:41</span>
      <span className="h-[30px] w-[108px] rounded-full bg-stone-900" />
      <span className="flex w-[54px] items-center justify-end gap-[5px] text-stone-900">
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
          <rect x="0" y="7" width="3" height="4" rx="0.8" />
          <rect x="4.6" y="5" width="3" height="6" rx="0.8" />
          <rect x="9.2" y="2.6" width="3" height="8.4" rx="0.8" />
          <rect x="13.8" y="0" width="3" height="11" rx="0.8" />
        </svg>
        <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor">
          <path d="M7.5 2.2c2 0 3.9.8 5.3 2.1l1.1-1.1A9 9 0 0 0 7.5.6 9 9 0 0 0 1.1 3.2l1.1 1.1a7.6 7.6 0 0 1 5.3-2.1zm0 3.2c1.1 0 2.2.4 3 1.2l1.1-1.1a5.9 5.9 0 0 0-8.2 0L4.5 6.6c.8-.8 1.9-1.2 3-1.2zm0 3.1-1.6 1.6L7.5 11l1.6-1.9z" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
          <rect x="0.5" y="0.5" width="21" height="11" rx="3.2" stroke="currentColor" opacity="0.4" />
          <rect x="2" y="2" width="18" height="8" rx="2" fill="currentColor" />
          <path d="M23 4v4c.8-.3 1.3-1.1 1.3-2S23.8 4.3 23 4z" fill="currentColor" opacity="0.45" />
        </svg>
      </span>
    </div>
  );
}

function HeaderButton({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200/80 bg-[#EAE4D6]">
      {children}
    </span>
  );
}

/** GrowChromeHeader + the Feed's right-hand actions (bell, messages, reels). */
export function AppHeader() {
  return (
    <div
      className="flex items-center justify-between border-b border-stone-200/50 bg-[#F3EEE4] px-4 py-2.5"
      aria-hidden="true"
    >
      <span className="flex items-center">
        <AppIconMark size={26} />
        <span className="ml-2 text-[15px] font-bold uppercase tracking-[2.5px] text-emerald-700">Grow!</span>
      </span>
      <span className="flex items-center gap-2">
        <HeaderButton>
          <NotificationsOutline size={17} color={BRAND} />
        </HeaderButton>
        <HeaderButton>
          <ChatbubblesOutline size={17} color={BRAND} />
        </HeaderButton>
        <HeaderButton>
          <PlayCircleOutline size={17} color={BRAND} />
        </HeaderButton>
      </span>
    </div>
  );
}

/** Neutral sample people: initials only, no photos. */
const STORIES = [
  { name: 'maya', initials: 'M', fill: '#D6E4D3', ink: '#3F5A3C', seen: false },
  { name: 'jonas', initials: 'J', fill: '#E7DCCB', ink: '#6B5537', seen: false },
  { name: 'lea', initials: 'L', fill: '#DCD9E6', ink: '#4D4868', seen: true },
  { name: 'tom', initials: 'T', fill: '#E6D5D0', ink: '#6E4339', seen: true },
] as const;

function StoriesRow() {
  return (
    <div className="mb-2 flex overflow-hidden px-4">
      <div className="mr-4 flex flex-col items-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-stone-300 bg-white/60">
          <Add size={22} color="#78716C" strokeWidth={1.9} />
        </span>
        <span className="mt-1 text-[11px] leading-[14px] text-stone-600">Your story</span>
      </div>
      {STORIES.map((s) => (
        <div key={s.name} className="mr-4 flex flex-col items-center">
          <span className="relative">
            <span
              className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 ${
                s.seen ? 'border-stone-300' : 'border-emerald-500'
              }`}
            >
              {/* Story preview: a soft tile with the person's initial. */}
              <span
                className="flex h-full w-full items-center justify-center text-[19px] font-semibold"
                style={{ background: s.fill, color: s.ink }}
              >
                {s.initials}
              </span>
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full border-2 border-[#FFFcf7] bg-emerald-100" />
          </span>
          <span className="mt-1 max-w-14 truncate text-[11px] leading-[14px] text-stone-600">{s.name}</span>
        </div>
      ))}
    </div>
  );
}

/** The first FeedPostCard, cut off by the dock like a real home screen. */
function PostCard() {
  return (
    <div className="mx-5 mb-4 overflow-hidden rounded-2xl border border-stone-200/70 bg-[#FFFcf7]">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex flex-1 items-center">
          <span
            className="mr-3 flex h-11 w-11 items-center justify-center rounded-full text-[17px] font-semibold"
            style={{ background: '#D6E4D3', color: '#3F5A3C' }}
          >
            M
          </span>
          <div className="flex-1">
            <p className="text-base font-bold leading-5 text-stone-900">maya</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              <span className="text-xs text-stone-500">2h</span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold leading-[14px] text-emerald-800">
                Fitness · Cardio
              </span>
            </div>
          </div>
        </div>
        <EllipsisHorizontal size={22} color="#57534E" />
      </div>
      <div className="px-4 pb-2">
        <span className="inline-block rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold leading-[14px] text-stone-700">
          Friend
        </span>
      </div>
      {/* Photo area: a quiet drawn morning-run scene instead of a stock photo. */}
      <div className="relative h-[230px] w-full bg-stone-50">
        <svg viewBox="0 0 360 230" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
          <rect width="360" height="230" fill="#E9EFE4" />
          <circle cx="268" cy="70" r="26" fill="#F8D9A8" />
          <path d="M0 150c60-30 120-34 180-14s120 18 180-10v104H0z" fill="#BFD6B6" />
          <path d="M0 182c70-20 150-22 220-6s100 10 140 0v54H0z" fill="#9CC09A" />
          <path d="M150 230c10-30 30-52 62-70" stroke="#F3EEE4" strokeWidth="10" strokeLinecap="round" fill="none" />
        </svg>
      </div>
      <div className="px-4 py-3">
        <div className="mb-3 flex items-center">
          <span className="mr-3.5">
            <HeartOutline size={26} color="#57534E" />
          </span>
          <span className="mr-3.5">
            <ChatbubbleOutline size={24} color="#57534E" />
          </span>
          <PaperPlaneOutline size={24} color="#57534E" />
        </div>
        <p className="mb-2 text-[15px] font-bold text-stone-900">
          12 likes <span className="mx-2 font-normal text-stone-300">·</span>
          <span className="font-semibold text-stone-600">3 comments</span>
        </p>
        <p className="text-base text-stone-900">
          <span className="font-bold">maya</span> First 5k without stopping.
        </p>
      </div>
    </div>
  );
}

/** Everything below the Today card on Home. */
export function HomeFeed() {
  return (
    <div aria-hidden="true">
      <StoriesRow />
      <div className="h-3" />
      <PostCard />
    </div>
  );
}

const DOCK_LEFT = [
  { label: 'Home', Icon: HomeFilled, active: true },
  { label: 'Explore', Icon: CompassOutline, active: false },
] as const;
const DOCK_RIGHT = [
  { label: 'Journal', Icon: BookOutline, active: false },
  { label: 'Shop', Icon: StorefrontOutline, active: false },
  { label: 'You', Icon: PersonOutline, active: false },
] as const;

function DockTab({
  label,
  Icon,
  active,
}: {
  label: string;
  Icon: (p: { size?: number; color?: string }) => React.ReactElement;
  active: boolean;
}) {
  // App uses #A8A29E for inactive tabs; #78716C keeps the drawn labels legible.
  const color = active ? BRAND : '#78716C';
  return (
    <span className="flex h-12 min-w-0 flex-1 flex-col items-center justify-center">
      <span className={`flex h-6 items-center justify-center ${active ? 'scale-[1.08]' : 'scale-[0.92]'}`}>
        <Icon size={22} color={color} />
      </span>
      <span
        className="flex h-[13px] items-center text-[10px] leading-3"
        style={{ color, fontWeight: active ? 600 : 400, opacity: active ? 1 : 0.85 }}
      >
        {label}
      </span>
      <span className="flex h-1.5 items-center">
        <span className="block h-1 w-1 rounded-full" style={{ background: active ? BRAND : 'transparent' }} />
      </span>
    </span>
  );
}

/** The floating dock from IndividualTabs.tsx: Home · Explore · (+) · Journal · Shop · You. */
export function Dock() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3.5 pb-[30px] pt-2" aria-hidden="true">
      <div className="flex items-center rounded-[28px] border-[0.5px] border-[rgba(28,25,23,0.08)] bg-[#FFFcf7] px-1 py-1.5 shadow-[0_8px_16px_rgba(28,25,23,0.12)]">
        <span className="flex h-12 flex-1">
          {DOCK_LEFT.map((t) => (
            <DockTab key={t.label} {...t} />
          ))}
        </span>
        <span className="flex h-12 w-14 items-center justify-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 shadow-[0_4px_6px_rgba(4,120,87,0.35)]">
            <Add size={24} color="#FFFFFF" />
          </span>
        </span>
        <span className="flex h-12 flex-1">
          {DOCK_RIGHT.map((t) => (
            <DockTab key={t.label} {...t} />
          ))}
        </span>
      </div>
      {/* iOS home indicator */}
      <span className="absolute bottom-2 left-1/2 block h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-stone-900" />
    </div>
  );
}

/** The Grow! mark sprouting inside the reply circle — the demo's one celebratory moment. */
function SproutMark() {
  return (
    <svg viewBox={MARK_VIEWBOX} className="h-[22px] w-auto overflow-visible" aria-hidden="true" fill="none">
      <path d={LEAF_PATH} fill="#FFFFFF" className="sprout-leaf" />
      <path d={SMILE_PATH} stroke="#FFFFFF" strokeWidth={66} strokeLinecap="round" />
      <path d={TAIL_PATH} stroke="#FFFFFF" strokeWidth={40} strokeLinecap="round" />
    </svg>
  );
}

type DotStatus = 'active' | 'rest' | 'today' | 'future';

/** Seven-dot Mon…Sun row (recap/WeekDots.tsx): filled = active, mint = rest, coral ring = today. */
function WeekDots({ first, size }: { first: DotStatus; size: number }) {
  const days: DotStatus[] = [first, 'future', 'future', 'future', 'future', 'future', 'future'];
  return (
    <span className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
      {days.map((s, i) => {
        const style: React.CSSProperties = { width: size, height: size, borderRadius: size / 2 };
        if (s === 'active') style.background = BRAND;
        else if (s === 'rest') Object.assign(style, { background: '#A7F3D0', border: '1px solid #34D399' });
        else if (s === 'today') Object.assign(style, { border: '1.5px solid #F97066' });
        else Object.assign(style, { border: '1px solid #E7E5E4' });
        return <span key={i} className="block shrink-0" style={style} />;
      })}
    </span>
  );
}

function FormHead({ editing }: { editing: boolean }) {
  return (
    <div className="flex items-start justify-between">
      <div className="flex-1 pr-3">
        <p className="text-[17px] font-bold leading-[22px] text-stone-900">Good morning, Sam.</p>
        <p className="mt-0.5 text-sm text-stone-500">
          {editing ? 'Update today’s check-in.' : 'How are you arriving today?'}
        </p>
      </div>
      <div className="flex flex-col items-end pt-1">
        <WeekDots first={editing ? 'active' : 'today'} size={8} />
        {/* App shows this in coral #E0584E; darkened for AA contrast at 10px. */}
        {editing ? <span className="mt-1 text-[10px] font-semibold text-[#B4382F]">1-day streak</span> : null}
      </div>
    </div>
  );
}

/** growthMeta.moodReply, by mood group. */
const REPLIES: Record<ReplyKind, string> = {
  honest: 'Thanks for being honest. Small is enough today.',
  steady: 'Steady counts. One step at a time.',
  energy: 'Love that energy. Go grow.',
};

function Reply({ kind }: { kind: ReplyKind }) {
  return (
    <div className="is-sprouted flex items-center">
      <span className="check-pop mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600">
        <SproutMark />
      </span>
      <span className="flex-1">
        <span className="block text-[15px] font-semibold leading-5 text-stone-900">{REPLIES[kind]}</span>
        <span className="mt-1 block text-xs font-semibold text-[#B4382F]">1-day streak</span>
      </span>
    </div>
  );
}

/** Icons for the interactive Today card, rendered here (server) and passed to the client island. */
export const DEMO_ART: DemoArt = {
  check: (
    <span className="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600">
      <Checkmark size={13} color="#FFFFFF" />
    </span>
  ),
  chevronDown: <ChevronDown size={14} color="#047857" className="ml-2 shrink-0" />,
  chevronUp: <ChevronUp size={14} color="#047857" className="ml-2 shrink-0" />,
  dotsDoneSmall: <WeekDots first="active" size={7} />,
  restCard: (
    <div className="mx-4 mb-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3.5">
      <div className="flex items-center justify-between">
        <p className="flex-1 pr-3 text-[15px] font-semibold leading-5 text-emerald-900">
          Rest is part of growing. Your streak is safe 🌿
        </p>
        <WeekDots first="rest" size={8} />
      </div>
      <p className="mt-1 text-xs text-emerald-800">See you tomorrow.</p>
    </div>
  ),
  journalNudge: (
    <div
      className="mt-2 flex items-center rounded-2xl border border-stone-200/70 bg-[#FFFcf7] px-3.5 py-2.5"
      aria-hidden="true"
    >
      <BookOutline size={16} color={BRAND} />
      <span className="ml-2 flex-1 truncate text-[13px] text-stone-700">Write more about today, privately</span>
      <ChevronForward size={14} color="#A8A29E" />
    </div>
  ),
  formHead: <FormHead editing={false} />,
  formHeadEditing: <FormHead editing />,
  reply: {
    honest: <Reply kind="honest" />,
    steady: <Reply kind="steady" />,
    energy: <Reply kind="energy" />,
  },
  writeMore: (
    <span className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-[13px] font-semibold text-white">
      <BookOutline size={15} color="#FFFFFF" /> Write more
    </span>
  ),
};
