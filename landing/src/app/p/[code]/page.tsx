import type { Metadata } from 'next';
import SiteNav from '@/components/SiteNav';
import SiteFooter from '@/components/SiteFooter';
import { APP_STORE_ID, getAppStoreUrl } from '@/lib/seo';

/**
 * Partner tracked link (https://letsgrow.lu/p/<code>), shared by a coach for a shop.
 * Resolves nothing server-side: the app resolves the code (and counts the click) when it
 * opens growl://p/<code>. Safari's smart banner carries the same app-argument.
 */

type Props = { params: Promise<{ code: string }> };

function cleanCode(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  return decoded.replace(/[^A-Za-z0-9-]/g, '').toUpperCase().slice(0, 40);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const clean = cleanCode(code);
  return {
    title: 'Open in Grow!',
    description: 'A coach on Grow! shared a shop pick with you. Open it in the app.',
    robots: { index: false, follow: false },
    alternates: { canonical: `/p/${clean}` },
    itunes: { appId: APP_STORE_ID, appArgument: `growl://p/${clean}` },
    openGraph: {
      title: 'Open in Grow!',
      description: 'A coach on Grow! shared a shop pick with you.',
    },
  };
}

export default async function PartnerLinkPage({ params }: Props) {
  const { code: rawCode } = await params;
  const code = cleanCode(rawCode);
  const appStoreUrl = getAppStoreUrl();
  const openInApp = `growl://p/${encodeURIComponent(code)}`;

  return (
    <>
      <SiteNav />
      <main id="main" className="bg-[#f3eee4] pt-16">
        <section className="mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center sm:py-24">
          <div
            aria-hidden
            className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-[#fffcf7] bg-emerald-700 text-4xl shadow-[0_12px_30px_rgba(28,25,23,0.12)]"
          >
            🌱
          </div>
          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-800">
            Shared by your coach
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
            Open in Grow!
          </h1>
          <p className="mt-4 text-base leading-7 text-stone-600">
            Your coach picked something from a shop on Grow! for you. Open it in the app to take a
            look — or get the app first, then tap the link again.
          </p>

          <div className="mt-10 w-full rounded-3xl border border-stone-200/80 bg-[#fffcf7] p-6 shadow-[0_8px_30px_rgba(28,25,23,0.05)]">
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href={openInApp}
                className="inline-flex flex-1 items-center justify-center rounded-full bg-emerald-700 px-6 py-3.5 text-base font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                Open in Grow!
              </a>
              <a
                href={appStoreUrl}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-stone-300/80 bg-white px-6 py-3.5 text-base font-semibold text-stone-800 transition hover:border-emerald-600/50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                Download on the App Store
              </a>
            </div>
            <p className="mt-4 text-xs text-stone-600">Grow! is free on iPhone.</p>
          </div>
        </section>
        <SiteFooter />
      </main>
    </>
  );
}
