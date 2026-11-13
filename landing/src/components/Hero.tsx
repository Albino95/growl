import AppStoreBadge from './AppStoreBadge';
import CheckInDemo from './CheckInDemo';
import QrCard from './QrCard';
import WaitlistForm from './WaitlistForm';
import { GetAppButton } from './MobileCta';
import { SeedMark } from './brand';

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[44px] bg-bark p-[10px] shadow-[0_40px_80px_-30px_rgba(28,25,23,0.45)]">
      <div className="overflow-hidden rounded-[34px] bg-soil">
        <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[11px] font-semibold text-bark" aria-hidden="true">
          <span>9:41</span>
          <span className="h-[18px] w-[76px] rounded-full bg-bark" />
          <span className="w-[26px]" />
        </div>
        <div className="flex items-center justify-between px-5 pb-3 pt-2">
          <span className="inline-flex items-center gap-1.5" aria-hidden="true">
            <SeedMark className="h-5 w-auto text-leaf" />
            <span className="font-display text-base font-extrabold tracking-[-0.02em]">Grow!</span>
          </span>
          <span className="text-xs font-medium text-moss">Monday</span>
        </div>
        <div className="px-3 pb-7">{children}</div>
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="px-5 pb-16 pt-10 sm:px-8 sm:pt-14 lg:px-10 lg:pb-24 lg:pt-20">
      <div className="mx-auto grid max-w-6xl gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:grid-rows-[auto_auto_1fr]">
        <div className="lg:col-start-1 lg:row-start-1">
          <h1 id="hero-title" className="display text-[clamp(2.75rem,6vw,5rem)] text-bark">
            <span className="block">Grow a little</span>
            <span className="block">every day.</span>
            <span className="mt-2 block text-[0.62em] font-bold tracking-[-0.015em] text-bark/85">Without the scroll.</span>
          </h1>
          <p className="measure mt-6 max-w-[34rem] text-[1.125rem] leading-[1.6] text-moss">
            Pick up to 3 things you care about — fitness, a language, art, money. Check in for ten
            seconds a day, rest when you need to, and share the progress with friends who cheer you on.
          </p>
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          {/* Mobile */}
          <div className="md:hidden">
            <GetAppButton className="w-full" />
          </div>
          {/* Tablet / desktop */}
          <div className="hidden flex-wrap items-center gap-4 md:flex">
            <AppStoreBadge className="h-[56px]" />
            <div className="hidden lg:block">
              <QrCard />
            </div>
          </div>
          <p className="mt-4 text-[0.9375rem] font-medium text-bark">Free. No ads. Your journal stays yours.</p>
        </div>

        <div className="lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:pt-2">
          <Phone>
            <CheckInDemo />
          </Phone>
          <p className="mx-auto mt-4 max-w-[340px] text-center text-sm text-moss">
            This is the check-in from the app. Go on, tap it.
          </p>
        </div>

        <div id="android" className="scroll-mt-28 lg:col-start-1 lg:row-start-3 lg:self-start">
          <WaitlistForm inputId="android-email" />
        </div>
      </div>
    </section>
  );
}
