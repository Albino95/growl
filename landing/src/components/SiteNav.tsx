import { Wordmark } from './brand';
import { APP_STORE_URL } from '@/lib/seo';

export default function SiteNav({ current }: { current?: 'coaches' } = {}) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-soil/95 backdrop-blur-sm">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-8 lg:px-10"
      >
        <a href="/" aria-label="Grow! home" className="-ml-1 shrink-0 rounded-lg px-1 py-1">
          <Wordmark />
        </a>
        <div className="flex items-center gap-0.5 sm:gap-3">
          <a
            href="/coaches"
            aria-current={current === 'coaches' ? 'page' : undefined}
            className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full px-2 text-sm font-semibold text-bark underline-offset-4 sm:px-3 hover:underline aria-[current=page]:underline aria-[current=page]:decoration-leaf aria-[current=page]:decoration-2"
          >
            For coaches
          </a>
          <a
            href={APP_STORE_URL}
            className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border border-bark/85 px-3.5 text-sm sm:px-4 font-semibold text-bark transition-colors hover:bg-bark hover:text-soil"
          >
            Get the app
          </a>
        </div>
      </nav>
    </header>
  );
}
