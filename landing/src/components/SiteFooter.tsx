import { Wordmark } from './brand';
import { SUPPORT_EMAIL } from '@/lib/content';
import { APP_STORE_URL, COMPANY_NAME, SITE_MOTTO, SITE_NAME } from '@/lib/seo';

const PRODUCT = [
  ['Get Grow! for iPhone', APP_STORE_URL],
  ['Android waitlist', '/#android'],
  ['For coaches', '/coaches'],
  ['Questions', '/#faq'],
] as const;

const LEGAL = [
  ['Privacy Policy', '/privacy'],
  ['Terms of Service', '/terms'],
  ['Community Guidelines', '/community'],
  ['Help & Support', '/support'],
  ['Delete your account', '/delete-account'],
] as const;

const linkClass =
  'inline-flex min-h-[40px] items-center underline-offset-4 hover:text-bark hover:underline';

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-soil">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-28 pt-14 text-[0.9375rem] text-moss sm:px-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] md:pb-14 lg:px-10">
        <div>
          <a href="/" aria-label="Grow! home" className="inline-block rounded-lg">
            <Wordmark />
          </a>
          <p className="mt-4 font-semibold text-bark">
            {SITE_NAME} by {COMPANY_NAME}
          </p>
          <p className="mt-1 max-w-[30ch]">{SITE_MOTTO}</p>
          <address className="mt-4 not-italic">
            Made in Luxembourg.
            <br />
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-bark underline decoration-moss/40 underline-offset-4 hover:decoration-bark">
              {SUPPORT_EMAIL}
            </a>
          </address>
        </div>

        <nav aria-labelledby="footer-product">
          <h2 id="footer-product" className="font-semibold text-bark">
            Grow!
          </h2>
          <ul className="mt-2">
            {PRODUCT.map(([label, href]) => (
              <li key={href}>
                <a href={href} className={linkClass}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-legal">
          <h2 id="footer-legal" className="font-semibold text-bark">
            Legal and help
          </h2>
          <ul className="mt-2">
            {LEGAL.map(([label, href]) => (
              <li key={href}>
                <a href={href} className={linkClass}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <p className="border-t border-line pt-6 text-sm md:col-span-3">
          © {year} {COMPANY_NAME}, Luxembourg. Apple, the Apple logo and iPhone are trademarks of Apple
          Inc. App Store is a service mark of Apple Inc.
        </p>
      </div>
    </footer>
  );
}
