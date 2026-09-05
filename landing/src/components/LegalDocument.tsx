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
      <main id="main" className="bg-[#f3eee4] pt-16">
        <article className="mx-auto max-w-3xl px-6 py-16 sm:px-8 sm:py-20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-800">
            Grow!
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-stone-900">
            {page.title}
          </h1>
          <p className="mt-3 text-sm text-stone-500">Last updated {page.updatedAt}</p>
          <p className="mt-4 text-base leading-7 text-stone-600">{page.description}</p>
          <nav
            aria-label="Related legal pages"
            className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-y border-stone-200/80 py-4 text-sm font-medium text-emerald-800"
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
                    ? 'text-stone-900 underline decoration-emerald-600/40 underline-offset-4'
                    : 'transition hover:text-emerald-950'
                }
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="mt-10 space-y-10">
            {page.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-lg font-semibold text-stone-900">{section.heading}</h2>
                {section.body.map((para) => (
                  <p key={para.slice(0, 48)} className="mt-3 text-base leading-7 text-stone-600">
                    {para}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </article>
        <SiteFooter />
      </main>
    </>
  );
}
