import WaitlistForm from './WaitlistForm';
import { getSiteUrl } from '@/lib/seo';

export default function SiteFooter() {
  const year = new Date().getFullYear();
  const siteUrl = getSiteUrl();

  return (
    <footer className="border-t border-stone-200 bg-[#f8fafc]">
      <section
        id="early-access"
        className="mx-auto max-w-6xl px-6 py-20 sm:px-8 lg:px-10"
        aria-labelledby="final-cta-heading"
      >
        <h2
          id="final-cta-heading"
          className="font-display text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl"
        >
          Start growing with purpose.
        </h2>
        <p className="mt-3 max-w-xl text-lg text-stone-600">
          Join the early access list and be first when Grow! opens on the App Store and Google
          Play.
        </p>
        <div className="relative mt-8">
          <WaitlistForm variant="footer" />
        </div>
      </section>

      <div className="border-t border-stone-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <p className="font-display text-lg font-bold tracking-tight text-emerald-800">
            Grow<span className="text-emerald-500">!</span>
          </p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-2">
            <a
              href={`${siteUrl}/privacy`}
              className="hover:text-emerald-700"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy
            </a>
            <a
              href={`${siteUrl}/terms`}
              className="hover:text-emerald-700"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms
            </a>
            <a
              href={`${siteUrl}/delete-account`}
              className="hover:text-emerald-700"
              target="_blank"
              rel="noopener noreferrer"
            >
              Delete account
            </a>
            <a href="mailto:support@grow.app" className="hover:text-emerald-700">
              Support
            </a>
          </nav>
          <p>© {year} Grow!</p>
        </div>
      </div>
    </footer>
  );
}
