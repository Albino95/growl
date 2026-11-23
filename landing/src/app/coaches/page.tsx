import type { Metadata } from 'next';
import SiteNav from '@/components/SiteNav';
import SiteFooter from '@/components/SiteFooter';
import AppStoreBadge from '@/components/AppStoreBadge';
import { SUPPORT_EMAIL } from '@/lib/content';
import { getSiteUrl, OG_IMAGE } from '@/lib/seo';

const TITLE = 'For coaches';
const DESCRIPTION =
  'Coach many clients on Grow! without losing track: a daily attention queue, Monday summaries, homework that can ask for proof, and group plans for up to 150 people. You set your rates; Grow! keeps a commission.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/coaches' },
  openGraph: {
    type: 'website',
    url: `${getSiteUrl()}/coaches`,
    title: `${TITLE} | Grow!`,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: { card: 'summary_large_image', title: `${TITLE} | Grow!`, description: DESCRIPTION, images: [OG_IMAGE.url] },
};

const WRAP = 'mx-auto max-w-6xl px-5 sm:px-8 lg:px-10';
const LINK = 'font-semibold text-leaf underline decoration-leaf/30 underline-offset-4 hover:decoration-leaf';

/* ------------------------------------------------------------ queue mock */

type Row = { name: string; why: string };
type Group = { label: string; dot: string; rows: Row[]; note?: string };

const QUEUE: Group[] = [
  {
    label: 'Act today',
    dot: 'bg-[#C2410C]',
    rows: [
      { name: 'Lena', why: 'No check-in for 4 days. Usually checks in daily.' },
      { name: 'Tom', why: 'Homework 2 days overdue.' },
    ],
  },
  {
    label: 'This week',
    dot: 'bg-[#CA8A04]',
    rows: [{ name: 'Noor', why: 'Plan ends in 5 days.' }],
  },
  {
    label: 'Wins',
    dot: 'bg-bloom',
    rows: [{ name: 'Marco', why: 'Reached a 30-day streak.' }],
  },
  {
    label: 'On track',
    dot: 'bg-leaf',
    rows: [],
    note: '11 clients. Nothing needs you today.',
  },
];

function QueueMock() {
  return (
    <figure className="w-full max-w-[26rem]">
      <div className="rounded-card border border-line bg-card p-5 sm:p-6">
        <div className="flex items-baseline justify-between">
          <p className="font-display text-[1.375rem] font-extrabold tracking-[-0.02em] text-bark">Today</p>
          <p className="text-sm text-moss">15 active clients</p>
        </div>
        <ul className="mt-4 space-y-5" aria-label="Example attention queue">
          {QUEUE.map((g) => (
            <li key={g.label}>
              <p className="flex items-center gap-2 text-sm font-semibold text-bark">
                <span className={`h-2.5 w-2.5 rounded-full ${g.dot}`} aria-hidden="true" />
                {g.label}
              </p>
              {g.rows.length ? (
                <ul className="mt-2 divide-y divide-line rounded-[16px] border border-line bg-soil/60">
                  {g.rows.map((r) => (
                    <li key={r.name} className="flex items-center gap-3 px-3.5 py-3">
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle text-[13px] font-bold text-bark"
                      >
                        {r.name.charAt(0)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.9375rem] font-semibold text-bark">{r.name}</span>
                        <span className="block text-sm leading-snug text-moss">{r.why}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 flex items-center justify-between gap-3 rounded-[16px] border border-line bg-soil/60 px-3.5 py-3 text-sm text-moss">
                  {g.note}
                  <span className="shrink-0 rounded-full bg-subtle px-3 py-1 text-[13px] font-semibold text-bark">
                    Seen
                  </span>
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="mt-4 text-sm text-moss">Example queue. Names are made up.</figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------ the coaching week */

const WEEK: Array<{ when: string; title: string; body: string }> = [
  {
    when: 'Monday morning',
    title: 'Start with the summary.',
    body: 'At 7 in the morning Grow! tells you where the week stands: how many clients need you, how many are on track, and the wins worth a message. It arrives as a notification, and by email too if you switch that on.',
  },
  {
    when: 'Every day',
    title: 'Ten minutes on the queue.',
    body: 'Today sorts your clients into Act today, This week, On track and Wins. Signals compare each client with their own usual rhythm, not with everyone else. Mark someone as handled and they rest for 7 days; disagree with a status and override it with a reason.',
  },
  {
    when: 'Midweek',
    title: 'Review homework in one pass.',
    body: 'Finished homework and new proof come up one after another. Reply with a saved template, write a line of your own, or mark it seen. Homework can ask for a kind of proof: a photo, a focus timer, a number, a note or a voice note.',
  },
  {
    when: 'The weekend',
    title: 'Ask your own questions.',
    body: 'From Saturday noon your clients get a two-minute weekly check-in. You choose up to 5 questions, and their answers come straight to you.',
  },
];

const STEPS = [
  ['Get endorsed', 'People growing on the same paths as you vouch for you inside the app.'],
  ['Share your progress', 'Post a few updates from your own practice, so clients can see how you work.'],
  ['Claim your coach profile', 'In Profile, open Become an instructor. Claiming unlocks the Instructor Hub.'],
  ['Set your weekly offer', 'Your fee, sessions per week and an optional trial. Clients send you a request and you send a plan.'],
] as const;

/* ------------------------------------------------------------ page */

export default function CoachesPage() {
  return (
    <>
      <SiteNav current="coaches" />
      <main id="main" className="pt-16">
        <section aria-labelledby="coach-title" className="border-b border-line">
          <div className={`${WRAP} grid gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16 lg:py-24`}>
            <div>
              <p className="font-display text-[1.375rem] font-semibold tracking-[-0.01em] text-moss">
                Grow! for coaches
              </p>
              <h1 id="coach-title" className="display mt-1 max-w-[14ch] text-[clamp(2.75rem,6vw,5rem)] text-bark">
                See who needs you today.
              </h1>
              <p className="measure mt-6 max-w-[34rem] text-[1.125rem] leading-[1.6] text-moss">
                Your clients check in for ten seconds a day. Grow! turns that into one short list each
                morning: who is slipping, who finished their homework, who just hit a milestone. Everyone
                else is fine, and the app tells you so.
              </p>
              <p className="measure mt-4 max-w-[34rem] text-[1.125rem] leading-[1.6] text-moss">
                It works for a personal trainer with twelve clients, and for a language teacher running a
                group of a hundred.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
                <AppStoreBadge className="h-[52px]" label="Download Grow! on the App Store to start coaching" />
                <a href="#become" className={`${LINK} text-[1.0625rem]`}>
                  How to become a coach
                </a>
              </div>
            </div>
            <div className="lg:pt-4">
              <QueueMock />
            </div>
          </div>
        </section>

        <section aria-labelledby="week-title" className="border-b border-line">
          <div className={`${WRAP} py-20 lg:py-24`}>
            <h2 id="week-title" className="display text-[1.75rem] text-bark sm:text-[2.5rem]">
              A coaching week on Grow!
            </h2>
            <p className="measure mt-4 text-[1.125rem] text-moss">
              Look at the exceptions, not at everyone. That is how one coach stays close to many people
              without living in the app.
            </p>
            <ol className="mt-12 grid gap-x-12 gap-y-10 border-t border-line pt-10 md:grid-cols-2">
              {WEEK.map((w) => (
                <li key={w.when}>
                  <p className="font-display text-[1.125rem] font-semibold tracking-[-0.01em] text-moss">{w.when}</p>
                  <h3 className="mt-1 font-display text-[1.375rem] font-bold leading-tight tracking-[-0.02em] text-bark sm:text-[1.75rem]">
                    {w.title}
                  </h3>
                  <p className="measure mt-3 text-[1.0625rem] text-moss">{w.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="groups-title" className="on-dark bg-deep-leaf text-soil">
          <div className={`${WRAP} grid gap-12 py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:py-24`}>
            <div>
              <h2 id="groups-title" className="display text-[1.75rem] text-soil sm:text-[2.5rem]">
                One plan, up to 150 people.
              </h2>
              <p className="measure mt-4 text-[1.125rem] text-soil/85">
                Group plans let you guide a whole cohort together: a running club, a language class, a
                four-week challenge. One update reaches everyone, and the same homework goes to all of them.
              </p>
            </div>
            <ul className="divide-y divide-soil/20 border-y border-soil/20 text-[1.0625rem]">
              {[
                ['Invite with a code', 'Share an 8-character code or link. People join from the app.'],
                ['Updates with replies', 'Post to the group; members reply in a thread.'],
                ['Group homework', 'See every member’s proof in one grid and mark them seen together.'],
                ['Progress at a glance', 'Follow the group week by week, from 1 to 12 weeks.'],
                ['Private to each member', 'Members never see each other’s proof. Only you do.'],
              ].map(([t, d]) => (
                <li key={t} className="py-4">
                  <p className="font-semibold text-soil">{t}</p>
                  <p className="mt-1 text-soil/80">{d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="trust-title" className="border-b border-line">
          <div className={`${WRAP} grid gap-12 py-20 lg:grid-cols-2 lg:py-24`}>
            <div>
              <h2 id="trust-title" className="display text-[1.75rem] text-bark sm:text-[2.5rem]">
                Your clients stay in charge.
              </h2>
              <ul className="mt-8 space-y-5 text-[1.0625rem] text-moss">
                <li className="measure">
                  <span className="font-semibold text-bark">Sharing is their choice.</span> Daily check-ins
                  reach you only if a client turns sharing on, and they can turn it off anytime. Homework
                  and its proof always come to you.
                </li>
                <li className="measure">
                  <span className="font-semibold text-bark">Proof is private.</span> Proof files are
                  never public links, photo location data is removed, and clients decide what else they
                  share.
                </li>
                <li className="measure">
                  <span className="font-semibold text-bark">Calm wording.</span> The queue never calls
                  anyone a failure and never makes medical claims. Partly counts.
                </li>
              </ul>
            </div>
            <div>
              <h2 className="display text-[1.75rem] text-bark sm:text-[2.5rem]">You set your rates</h2>
              <p className="measure mt-6 text-[1.125rem] text-moss">
                You set your weekly offer in the app. Grow! keeps a commission based on your rates, so
                you only share when you earn. There are no sign-up or monthly fees.
              </p>
            </div>
          </div>
        </section>

        <section id="become" aria-labelledby="become-title" className="scroll-mt-20 border-b border-line">
          <div className={`${WRAP} py-20 lg:py-24`}>
            <h2 id="become-title" className="display text-[1.75rem] text-bark sm:text-[2.5rem]">
              Becoming a coach on Grow!
            </h2>
            <p className="measure mt-4 text-[1.125rem] text-moss">
              Coaches are endorsed by the community, not by a sign-up form. It takes four steps, all in the
              app.
            </p>
            <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(([t, d], i) => (
                <li key={t} className="border-t-2 border-bark pt-4">
                  <p className="font-display text-[2.5rem] font-extrabold leading-none text-bark" aria-hidden="true">
                    {i + 1}
                  </p>
                  <h3 className="mt-3 text-[1.125rem] font-semibold text-bark">{t}</h3>
                  <p className="mt-2 text-[0.9375rem] text-moss">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="coach-cta" className="text-center">
          <div className="mx-auto flex max-w-3xl flex-col items-center px-5 py-24 sm:py-28">
            <h2 id="coach-cta" className="display text-[clamp(2.25rem,5vw,4rem)] text-bark">
              Start with your own week.
            </h2>
            <p className="mt-4 max-w-[40ch] text-[1.125rem] text-moss">
              Coaches on Grow! start as members. Download it, pick your paths, and check in tomorrow
              morning.
            </p>
            <div className="mt-8">
              <AppStoreBadge className="h-[56px]" />
            </div>
            <p className="mt-6 text-[0.9375rem] text-moss">
              Questions about coaching?{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK}>
                {SUPPORT_EMAIL}
              </a>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
