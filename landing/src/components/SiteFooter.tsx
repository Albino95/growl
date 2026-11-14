import { Wordmark } from './brand';
import { SUPPORT_EMAIL } from '@/lib/content';
import { COMPANY_NAME, SITE_NAME } from '@/lib/seo';

const LINKS = [
  ['Privacy', '/privacy'],
  ['Terms', '/terms'],
  ['Guidelines', '/community'],
  ['Support', '/support'],
  ['Delete account', '/delete-account'],
] as const;

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-soil">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-sm text-moss sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
        <div className="flex flex-col gap-2">
          <a href="/" aria-label="Grow! home" className="w-fit rounded-lg">
            <Wordmark />
          </a>
          <p className="font-medium text-bark">
            {SITE_NAME} by {COMPANY_NAME}. Making your life better, a little each day.
          </p>
          <p>
            Made in Luxembourg. Write to us at{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline decoration-moss/40 underline-offset-4 hover:text-bark">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
        <nav aria-label="Legal">
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {LINKS.map(([label, href]) => (
              <li key={href}>
                <a href={href} className="inline-flex min-h-[44px] items-center hover:text-bark">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p>© {year} {COMPANY_NAME}</p>
      </div>
    </footer>
  );
}
