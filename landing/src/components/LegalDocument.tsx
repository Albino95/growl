import type { Metadata } from 'next';
import type { LegalPageId } from '@/lib/legal';
import { LEGAL_PAGES } from '@/lib/legal';
import SiteNav from '@/components/SiteNav';
import SiteFooter from '@/components/SiteFooter';

export function legalMetadata(id: LegalPageId): Metadata {
  const page = LEGAL_PAGES[id];
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: `/${id}` },
  };
}

export default function LegalDocument({ id }: { id: LegalPageId }) {
  const page = LEGAL_PAGES[id];

  return (
    <>
      <SiteNav />
      <main id="main" className="bg-soil pt-16">
        <article className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
          <h1 className="display text-[2.5rem] text-bark">{page.title}</h1>
          <p className="mt-3 text-sm text-moss">Last updated {page.updatedAt}</p>
          <p className="measure mt-4 text-[1.0625rem] text-moss">{page.description}</p>
          <nav
            aria-label="Related legal pages"
            className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-y border-line py-4 text-sm font-semibold text-leaf"
          >
            {(
              [
                ['Privacy', '/privacy'],
                ['Terms', '/terms'],
                ['Guidelines', '/community'],
                ['Support', '/support'],
                ['Delete account', '/delete-account'],
              ] as const
            ).map(([label, href]) => (
              <a
                key={href}
                href={href}
                className={
                  href === `/${id}`
                    ? 'text-bark underline decoration-leaf/50 underline-offset-4'
                    : 'hover:text-bark'
                }
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="mt-10 space-y-10">
            {page.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="font-display text-[1.375rem] font-bold tracking-[-0.01em] text-bark">
                  {section.heading}
                </h2>
                {section.body.map((para) => (
                  <p key={para.slice(0, 48)} className="measure mt-3 text-base leading-[1.7] text-moss">
                    {para}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
