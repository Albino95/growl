import WaitlistForm from './WaitlistForm';
import { getSiteUrl } from '@/lib/seo';

export default function SiteFooter() {
  const year = new Date().getFullYear();
  const siteUrl = getSiteUrl();

  return (
    <footer className="bg-[var(--surface-deep)] text-emerald-50">
      <section
        id="early-access"
        className="relative overflow-hidden px-6 py-20 sm:px-8 sm:py-24 lg:px-10"
        aria-labelledby="final-cta-heading"
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 50% 55% at 80% 20%, rgba(5,150,105,0.35), transparent 55%), radial-gradient(ellipse 40% 40% at 10% 85%, rgba(52,211,153,0.12), transparent 50%)',
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-6xl">
          <h2
            id="final-cta-heading"
            className="max-w-xl font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-[2.75rem] lg:leading-tight"
          >
            Start growing with purpose.
          </h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-emerald-100/75">
            Join early access and be first when Grow! opens on the App Store and Google Play.
          </p>
          <div className="mt-9 max-w-lg rounded-3xl border border-white/10 bg-[var(--surface)] p-5 sm:p-6">
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
            <a href={`${siteUrl}/privacy`} className="transition hover:text-white">
              Privacy
            </a>
            <a href={`${siteUrl}/terms`} className="transition hover:text-white">
              Terms
            </a>
            <a href={`${siteUrl}/community`} className="transition hover:text-white">
              Guidelines
            </a>
            <a href={`${siteUrl}/delete-account`} className="transition hover:text-white">
              Delete account
            </a>
            <a href={`${siteUrl}/support`} className="transition hover:text-white">
              Support
            </a>
          </nav>
          <p>© {year} Grow!</p>
        </div>
      </div>
    </footer>
  );
}
