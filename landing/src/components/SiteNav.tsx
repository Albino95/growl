import { Wordmark } from './brand';
import { APP_STORE_URL } from '@/lib/seo';

export default function SiteNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-soil/95 backdrop-blur-sm">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8 lg:px-10"
      >
        <a href="/" aria-label="Grow! home" className="-ml-1 rounded-lg px-1 py-1">
          <Wordmark />
        </a>
        <a
          href={APP_STORE_URL}
          className="inline-flex min-h-[44px] items-center rounded-full border border-bark/85 px-4 text-sm font-semibold text-bark transition-colors hover:bg-bark hover:text-soil"
        >
          Get the app
        </a>
      </nav>
    </header>
  );
}
