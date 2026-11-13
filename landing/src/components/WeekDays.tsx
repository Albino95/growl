import { WEEK, type Day } from '@/lib/content';
import { LEAF_PATH, MARK_VIEWBOX, SMILE_PATH, TAIL_PATH } from './brand';

const day = (id: string) => WEEK.find((d) => d.id === id) as Day;

/* ---------------------------------------------------------------- shell */

function DaySection({
  d,
  title,
  lede,
  children,
  dark = false,
}: {
  d: Day;
  title: string;
  lede: React.ReactNode;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <section
      id={d.id}
      aria-labelledby={`${d.id}-day ${d.id}-title`}
      className={`day-section ${dark ? 'on-dark bg-deep-leaf text-soil' : ''}`}
    >
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28 lg:pl-36 lg:pr-10">
        <p
          id={`${d.id}-day`}
          className={`font-display text-[1.375rem] font-semibold tracking-[-0.01em] ${
            dark ? 'text-soil/75' : 'text-moss'
          }`}
        >
          {d.name}
        </p>
        <h2 id={`${d.id}-title`} className={`display mt-1 text-[1.75rem] sm:text-[2.5rem] ${dark ? 'text-soil' : 'text-bark'}`}>
          {title}
        </h2>
        <p className={`measure mt-4 max-w-[36rem] text-[1.125rem] ${dark ? 'text-soil/85' : 'text-moss'}`}>{lede}</p>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

function Caption({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return <p className={`mt-4 text-sm ${dark ? 'text-soil/70' : 'text-moss'}`}>{children}</p>;
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
        on ? 'border-leaf bg-leaf text-white' : 'border-[#B9B1A1]'
      }`}
    >
      {on ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}

function Avatar({ name, tone }: { name: string; tone: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${tone}`}
    >
      {name.charAt(0)}
    </span>
  );
}

/* ---------------------------------------------------------------- Monday */

const IDENTITIES = [
  { who: 'moves every day.', path: 'Fitness', on: true },
  { who: 'speaks a little Spanish.', path: 'Language', on: true },
  { who: 'draws again.', path: 'Art', on: true },
  { who: 'ships side projects.', path: 'Career', on: false },
];

function Monday() {
  return (
    <DaySection
      d={day('monday')}
      title="Choose up to 3 paths."
      lede="Start with who you want to become, not a to-do list. Three paths is the limit, on purpose: enough to matter, few enough to actually show up for."
    >
      <div className="max-w-3xl">
        <p className="font-display text-[1.75rem] font-bold tracking-[-0.02em] text-moss sm:text-[2.5rem]" aria-hidden="true">
          Become someone who…
        </p>
        <ul className="mt-4 border-t border-line" aria-label="Example paths">
          {IDENTITIES.map((it) => (
            <li
              key={it.who}
              className={`flex items-center gap-4 border-b border-line py-4 sm:gap-5 sm:py-5 ${it.on ? '' : 'opacity-55'}`}
            >
              <Check on={it.on} />
              <span className="min-w-0 flex-1 font-display text-[1.375rem] font-bold leading-tight tracking-[-0.02em] text-bark sm:text-[1.75rem]">
                <span className="sr-only">Become someone who </span>
                {it.who}
              </span>
              <span className="hidden shrink-0 rounded-full bg-subtle px-3 py-1 text-sm font-semibold text-bark/80 sm:inline">
                {it.path}
              </span>
              {!it.on ? <span className="sr-only">(not selected)</span> : null}
            </li>
          ))}
        </ul>
        <Caption>Three chosen. The fourth can wait until one of them feels easy.</Caption>
      </div>
    </DaySection>
  );
}

/* ---------------------------------------------------------------- Tuesday */

function Tuesday() {
  return (
    <DaySection
      d={day('tuesday')}
      title="Ten seconds, three taps."
      lede="Every day starts the same way: how you’re arriving, where you’ll grow, and one small step if you feel like writing it down. Then you close the app and go do it."
    >
      <ol className="grid overflow-hidden rounded-card border border-line bg-card md:grid-cols-3">
        <li className="border-b border-line p-6 md:border-b-0 md:border-r">
          <p className="font-display text-[2.5rem] font-extrabold leading-none text-bark">1</p>
          <h3 className="mt-3 text-[1.125rem] font-semibold text-bark">How are you arriving?</h3>
          <div className="mt-5 flex justify-between" aria-hidden="true">
            {[
              ['🌧', 'Heavy'],
              ['🌙', 'Tired'],
              ['◇', 'Okay'],
              ['😊', 'Good'],
              ['⚡', 'Bright'],
            ].map(([g, l]) => (
              <span
                key={l}
                className={`flex w-12 flex-col items-center rounded-2xl border py-1.5 ${
                  l === 'Tired' ? 'border-emerald-300 bg-emerald-50' : 'border-transparent'
                }`}
              >
                <span className="text-lg leading-none">{g}</span>
                <span className={`mt-1 text-[11px] ${l === 'Tired' ? 'font-semibold text-emerald-900' : 'text-moss'}`}>{l}</span>
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm text-moss">Any answer counts. Tired is a fine place to start.</p>
        </li>
        <li className="border-b border-line p-6 md:border-b-0 md:border-r">
          <p className="font-display text-[2.5rem] font-extrabold leading-none text-bark">2</p>
          <h3 className="mt-3 text-[1.125rem] font-semibold text-bark">Today I’ll grow in…</h3>
          <div className="mt-5 flex flex-wrap gap-2" aria-hidden="true">
            <span className="rounded-full bg-subtle px-3.5 py-1.5 text-[13px] font-semibold text-bark/80">Fitness</span>
            <span className="rounded-full bg-leaf px-3.5 py-1.5 text-[13px] font-semibold text-white">Language</span>
            <span className="rounded-full bg-subtle px-3.5 py-1.5 text-[13px] font-semibold text-bark/80">Art</span>
          </div>
          <p className="mt-4 text-sm text-moss">One of your paths. Not all three, every day.</p>
        </li>
        <li className="p-6">
          <p className="font-display text-[2.5rem] font-extrabold leading-none text-bark">3</p>
          <h3 className="mt-3 text-[1.125rem] font-semibold text-bark">One small step</h3>
          <div className="mt-5" aria-hidden="true">
            <div className="rounded-[14px] border border-[#DDD6C8] bg-white px-3.5 py-2.5 text-[15px] text-bark">
              Ten new words on the bus
            </div>
            <div className="mt-2 rounded-[14px] bg-leaf py-2.5 text-center text-[15px] font-semibold text-white">Done</div>
          </div>
          <p className="mt-4 text-sm text-moss">Optional. Leave it blank and still check in.</p>
        </li>
      </ol>
    </DaySection>
  );
}

/* ---------------------------------------------------------------- Wednesday */

function SleepingSprout({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="240 80 600 760" className={className} aria-hidden="true" fill="none">
      {/* Leaf folded down: the mark, resting. */}
      <g transform="rotate(38 470 600)">
        <path d={LEAF_PATH} fill="currentColor" opacity="0.92" />
      </g>
      <path d={SMILE_PATH} stroke="currentColor" strokeWidth={66} strokeLinecap="round" />
      <path d={TAIL_PATH} stroke="currentColor" strokeWidth={40} strokeLinecap="round" />
      <g fill="currentColor" style={{ fontFamily: "var(--font-display)" }} fontWeight="800">
        <text x="640" y="300" fontSize="96" opacity="0.8">z</text>
        <text x="720" y="200" fontSize="72" opacity="0.6">z</text>
        <text x="780" y="120" fontSize="52" opacity="0.4">z</text>
      </g>
    </svg>
  );
}

function Wednesday() {
  return (
    <DaySection
      d={day('wednesday')}
      dark
      title="Rest is part of it."
      lede="Every 7 active days earns you a rest day, and you can save up to 2. Take one and your streak simply waits. Miss a day without one and nobody scolds you."
    >
      <div className="grid items-center gap-12 md:grid-cols-[minmax(0,1fr)_auto]">
        <figure>
          <blockquote className="display max-w-[16ch] text-[2.5rem] text-soil sm:text-[clamp(2.75rem,5vw,4rem)]">
            Welcome back. Your longest streak is safe.
          </blockquote>
          <figcaption className="mt-5 text-[1.0625rem] text-soil/80">
            What Grow! says when you come back after a break.
          </figcaption>
        </figure>
        <SleepingSprout className="mx-auto h-48 w-auto text-[#A7F3D0] md:h-64" />
      </div>
    </DaySection>
  );
}

/* ---------------------------------------------------------------- Thursday */

const ENTRY = 'Ran 2 km before work. Legs heavy, head clear. Tomorrow, same route.';

function Thursday() {
  return (
    <DaySection
      d={day('thursday')}
      title="Your circle, not a crowd."
      lede="Your journal is private by default. When an entry is worth sharing, you can show it to your circle: the friends you chose, nobody else."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <article aria-label="Private journal entry" className="rounded-card border border-dashed border-[#CFC7B6] p-6">
          <p className="flex items-center gap-2 text-sm font-semibold text-moss">
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
              <rect x="3" y="7" width="10" height="7" rx="1.6" fill="currentColor" />
              <path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            Only you
          </p>
          <p className="mt-4 font-display text-[1.375rem] font-semibold leading-snug tracking-[-0.01em] text-bark">{ENTRY}</p>
          <p className="mt-4 text-sm text-moss">Tuesday, Fitness</p>
        </article>

        <article aria-label="The same entry, shared with your circle" className="rounded-card border border-line bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-bark">Shared with your circle</p>
            <span className="flex -space-x-2" role="img" aria-label="Visible to Ana and Luca">
              <Avatar name="Ana" tone="bg-[#FFE4E1] text-[#9A2D24] ring-2 ring-card" />
              <Avatar name="Luca" tone="bg-subtle text-bark ring-2 ring-card" />
            </span>
          </div>
          <p className="mt-4 font-display text-[1.375rem] font-semibold leading-snug tracking-[-0.01em] text-bark">{ENTRY}</p>
          <p className="mt-4 flex items-center gap-2 text-sm text-bark">
            <span className="h-2.5 w-2.5 rounded-full bg-bloom" aria-hidden="true" />
            Ana cheered you on
          </p>
        </article>
      </div>
      <Caption>Example entry. You decide, one entry at a time.</Caption>
    </DaySection>
  );
}

/* ---------------------------------------------------------------- Friday */

const BOARD = [
  { name: 'Ana', days: 12, tone: 'bg-[#FFE4E1] text-[#9A2D24]' },
  { name: 'You', days: 11, tone: 'bg-leaf text-white', you: true },
  { name: 'Luca', days: 9, tone: 'bg-subtle text-bark' },
];

function Friday() {
  const done = 11;
  return (
    <DaySection
      d={day('friday')}
      title="Grow with friends."
      lede="Start a 30-day path challenge with a few friends. The leaderboard only shows people you know, so it feels like a team, not a ranking."
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-end">
        <div>
          <article aria-labelledby="challenge-title" className="rounded-card border border-line bg-card p-6">
            <h3 id="challenge-title" className="font-display text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] text-bark">
              30 days of moving
            </h3>
            <p className="mt-1 text-sm text-moss">Fitness, day {done} of 30</p>

            <div className="mt-5 grid grid-cols-10 gap-1.5" role="img" aria-label={`${done} of 30 days done`}>
              {Array.from({ length: 30 }, (_, i) => (
                <span
                  key={i}
                  className={`aspect-square rounded-[5px] ${
                    i < done ? 'bg-leaf' : i === done ? 'border-[1.5px] border-leaf' : 'bg-subtle'
                  }`}
                />
              ))}
            </div>

            <h4 className="mt-6 text-sm font-semibold text-bark">Friends only</h4>
            <ol className="mt-2 divide-y divide-line">
              {BOARD.map((p, i) => (
                <li key={p.name} className="flex items-center gap-3 py-2.5">
                  <span className="w-4 text-sm font-semibold text-moss">{i + 1}</span>
                  <Avatar name={p.name} tone={p.tone} />
                  <span className={`flex-1 text-[0.9375rem] ${p.you ? 'font-semibold text-bark' : 'text-bark'}`}>{p.name}</span>
                  <span className="text-sm text-moss">{p.days} days</span>
                </li>
              ))}
            </ol>
          </article>
          <Caption>Sample challenge. Names are examples.</Caption>
        </div>

        <div className="max-w-md lg:pb-12">
          <h3 className="font-display text-[1.375rem] font-bold tracking-[-0.01em] text-bark">Want a guide?</h3>
          <p className="mt-2 text-[1.0625rem] text-moss">
            Coaches on Grow! are endorsed by the community: people growing on the same path vouch for
            them. Find one for your path when you want more than a nudge.
          </p>
        </div>
      </div>
    </DaySection>
  );
}

/* ---------------------------------------------------------------- Saturday */

const BADGES = [
  { emoji: '☀️', name: 'Checked In', what: 'Your first check-in', bg: 'bg-[#FEF3C7]' },
  { emoji: '🌿', name: 'Taking Root', what: 'A 3-day streak', bg: 'bg-[#ECFDF5]' },
  { emoji: '💛', name: 'Seen', what: 'Your first cheer from a friend', bg: 'bg-[#FFF1F0]' },
];

const LEVELS = ['Seed', 'Sprout', 'Sapling', 'Bloom', 'Tree', 'Grove'];

function Saturday() {
  return (
    <DaySection
      d={day('saturday')}
      title="Small wins, noticed."
      lede="There are 15 badges, for the things that are actually hard: starting, coming back, cheering someone on. And a level that grows with you, from Seed to Grove."
    >
      <ul className="flex flex-wrap gap-x-10 gap-y-6" aria-label="Three of the 15 badges">
        {BADGES.map((b) => (
          <li key={b.name} className="flex items-center gap-4">
            <span className={`flex h-16 w-16 items-center justify-center rounded-full text-[1.75rem] ${b.bg}`} aria-hidden="true">
              {b.emoji}
            </span>
            <span>
              <span className="block font-display text-[1.125rem] font-bold tracking-[-0.01em] text-bark">{b.name}</span>
              <span className="block text-sm text-moss">{b.what}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-14 max-w-3xl">
        <h3 className="text-sm font-semibold text-bark">Levels</h3>
        <ol className="relative mt-5 grid grid-cols-6" aria-label="Levels, from Seed to Grove">
          <span className="absolute left-[8.33%] right-[8.33%] top-[9px] h-[2px] bg-[#D6CFC0]" aria-hidden="true" />
          <span className="absolute left-[8.33%] top-[9px] h-[2px] w-[16.66%] bg-leaf" aria-hidden="true" />
          {LEVELS.map((l, i) => (
            <li key={l} className="relative flex flex-col items-center text-center" aria-current={i === 1 ? 'step' : undefined}>
              <span
                className={`relative h-5 w-5 rounded-full border-2 ${
                  i < 1 ? 'border-leaf bg-leaf' : i === 1 ? 'border-leaf bg-soil' : 'border-[#D6CFC0] bg-soil'
                }`}
                aria-hidden="true"
              />
              <span className={`mt-2 text-[13px] sm:text-sm ${i === 1 ? 'font-semibold text-bark' : 'text-moss'}`}>{l}</span>
            </li>
          ))}
        </ol>
        <Caption>Example: a few weeks in, at Sprout.</Caption>
      </div>
    </DaySection>
  );
}

/* ---------------------------------------------------------------- Sunday */

const RECAP_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function RecapCard() {
  return (
    <div
      className="flex aspect-[9/16] w-full max-w-[300px] flex-col rounded-[28px] bg-deep-leaf p-6 text-soil"
      role="img"
      aria-label="Example weekly recap: 6 check-ins, 1 rest day, 9-day streak. Reflection: Tired on Tuesday. Went anyway."
    >
      <div className="flex items-center justify-between">
        <p className="font-display text-[1.375rem] font-extrabold tracking-[-0.02em]">Your week</p>
        <p className="text-xs text-soil/75">Nov 3 – 9</p>
      </div>

      <div className="mt-6 flex justify-between">
        {RECAP_DAYS.map((d, i) => (
          <span key={i} className="flex flex-col items-center gap-1.5">
            {i === 2 ? (
              <svg viewBox="0 0 16 16" className="h-4 w-4 text-[#A7F3D0]">
                <path d="M10.8 1.6a6.6 6.6 0 1 0 3.6 11.2A5.6 5.6 0 0 1 10.8 1.6Z" fill="currentColor" />
              </svg>
            ) : (
              <span className="h-4 w-4 rounded-full bg-[#A7F3D0]" />
            )}
            <span className="text-[10px] font-semibold text-soil/70">{d}</span>
          </span>
        ))}
      </div>

      <dl className="mt-8 space-y-4">
        <div>
          <dt className="text-xs text-soil/70">Check-ins</dt>
          <dd className="font-display text-[2.5rem] font-extrabold leading-none tracking-[-0.02em]">6</dd>
        </div>
        <div>
          <dt className="text-xs text-soil/70">Rest day</dt>
          <dd className="font-display text-[1.75rem] font-extrabold leading-none tracking-[-0.02em]">1</dd>
        </div>
        <div>
          <dt className="text-xs text-soil/70">Streak</dt>
          <dd className="font-display text-[1.75rem] font-extrabold leading-none tracking-[-0.02em] text-bloom">9 days</dd>
        </div>
      </dl>

      <p className="mt-auto font-display text-[1.25rem] font-semibold leading-snug tracking-[-0.01em]">
        “Tired on Tuesday. Went anyway.”
      </p>
      <p className="mt-5 border-t border-soil/20 pt-3 text-xs font-semibold text-soil/80">Grow! · letsgrow.lu</p>
    </div>
  );
}

function Sunday() {
  return (
    <DaySection
      d={day('sunday')}
      title="Your week, in one card."
      lede="When your week ends, Grow! gathers it into a single card: the days you showed up, the days you rested, and a short note on how it went. Keep it, or share it as a Story or a square."
    >
      <div className="flex flex-col items-start gap-8 sm:flex-row sm:items-end">
        <RecapCard />
        <div className="max-w-xs pb-2">
          <p className="text-[1.0625rem] text-moss">
            Nothing to edit, nothing to perform. Just the week you actually had.
          </p>
          <Caption>Example recap.</Caption>
        </div>
      </div>
    </DaySection>
  );
}

export default function WeekDays() {
  return (
    <>
      <Monday />
      <Tuesday />
      <Wednesday />
      <Thursday />
      <Friday />
      <Saturday />
      <Sunday />
    </>
  );
}
