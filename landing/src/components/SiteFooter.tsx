import WaitlistForm from './WaitlistForm';
import { getSiteUrl } from '@/lib/seo';

export default function SiteFooter() {
  const year = new Date().getFullYear();
  const siteUrl = getSiteUrl();

  return (
    <footer className="border-t border-stone-900/10 bg-[#0c1f17] text-emerald-50">
      <section
        id="early-access"
        className="mx-auto max-w-6xl px-6 py-20 sm:px-8 sm:py-24 lg:px-10"
        aria-labelledby="final-cta-heading"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">
          Early access
        </p>
        <h2
          id="final-cta-heading"
          className="mt-4 max-w-xl font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-[2.75rem] lg:leading-tight"
        >
          Start growing with purpose.
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-emerald-100/75">
          Join the early access list and be first when Grow! opens on the App Store and Google
          Play.
        </p>
        <div className="relative mt-9 max-w-lg">
          {/* Footer form uses light inputs; wrap for contrast on dark band */}
          <div className="rounded-3xl border border-white/10 bg-[#f3eee4] p-5 sm:p-6">
            <WaitlistForm variant="footer" />
          </div>
        </div>
      </section>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-8 text-sm text-emerald-100/55 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <p className="font-display text-lg font-bold tracking-tight text-white">
            Grow<span className="text-emerald-400">!</span>
          </p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-2">
            <a
              href={`${siteUrl}/privacy`}
              className="transition hover:text-white"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy
            </a>
            <a
              href={`${siteUrl}/terms`}
              className="transition hover:text-white"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms
            </a>
            <a
              href={`${siteUrl}/delete-account`}
              className="transition hover:text-white"
              target="_blank"
              rel="noopener noreferrer"
            >
              Delete account
            </a>
            <a href="mailto:support@grow.app" className="transition hover:text-white">
              Support
            </a>
          </nav>
          <p>© {year} Grow!</p>
        </div>
      </div>
    </footer>
  );
}
