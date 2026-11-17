import AppStoreBadge from './AppStoreBadge';
import CheckInDemo from './CheckInDemo';
import QrCard from './QrCard';
import WaitlistForm from './WaitlistForm';
import { GetAppButton } from './MobileCta';
import { AppHeader, DEMO_ART, Dock, HomeFeed, StatusBar } from './AppHome';

export default function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="px-5 pb-16 pt-10 sm:px-8 sm:pt-14 lg:px-10 lg:pb-24 lg:pt-20">
      <div className="mx-auto grid max-w-6xl gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:grid-rows-[auto_auto_1fr]">
        <div className="lg:col-start-1 lg:row-start-1">
          <h1 id="hero-title" className="display text-[clamp(2.75rem,6vw,5rem)] text-bark">
            <span className="block">Let’s Grow.</span>
            <span className="mt-3 block max-w-[22ch] text-[0.5em] font-bold leading-[1.12] tracking-[-0.015em] text-bark/85">
              Making your life better, a little each day.
            </span>
          </h1>
          <p className="measure mt-6 max-w-[34rem] text-[1.125rem] leading-[1.6] text-moss">
            Pick up to 3 things you care about — fitness, a language, art, money. Check in for ten
            seconds a day, rest when you need to, and share the progress with friends who cheer you on.
            All without the endless scroll.
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
          {/* Phone: the app's Home screen, designed at a 360pt-wide screen and zoomed to fit (.phone-zoom). */}
          <div className="phone-zoom mx-auto w-[380px] rounded-[44px] bg-bark p-[10px] shadow-[0_40px_80px_-30px_rgba(28,25,23,0.45)]">
            <div
              className="app-ui relative h-[740px] overflow-hidden rounded-[34px] bg-[#F3EEE4]"
              role="region"
              aria-label="Grow! home screen. Try the Today check-in."
            >
              <StatusBar />
              <AppHeader />
              <div className="pt-1">
                <CheckInDemo art={DEMO_ART} captionId="demo-caption" />
                <HomeFeed />
              </div>
              <Dock />
            </div>
          </div>
          <p id="demo-caption" className="mx-auto mt-4 max-w-[340px] text-center text-sm text-moss">
            This is the home screen of the app. Go on, tap a mood. Nothing is saved.
          </p>
        </div>

        <div id="android" className="scroll-mt-28 lg:col-start-1 lg:row-start-3 lg:self-start">
          <WaitlistForm inputId="android-email" />
        </div>
      </div>
    </section>
  );
}
