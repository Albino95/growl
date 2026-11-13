import type { Metadata } from 'next';
import SiteNav from '@/components/SiteNav';
import SiteFooter from '@/components/SiteFooter';
import CopyCodeButton from '@/components/CopyCodeButton';
import { getAppStoreUrl } from '@/lib/seo';

const API_BASE = 'https://growl-backend-production.wispy-leaf-4e8b.workers.dev/api/v1';

type Inviter = { username: string; avatar: string | null };
type Lookup = { status: 'ok'; inviter: Inviter } | { status: 'expired' } | { status: 'error' };

type Props = { params: Promise<{ code: string }> };

function cleanCode(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  return decoded.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 32);
}

async function lookupInvite(code: string): Promise<Lookup> {
  if (!code) return { status: 'expired' };
  try {
    const res = await fetch(`${API_BASE}/invites/${encodeURIComponent(code)}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
    });
    if (res.status === 404) return { status: 'expired' };
    if (!res.ok) return { status: 'error' };
    const json = (await res.json()) as { data?: { inviter?: Inviter }; inviter?: Inviter };
    const inviter = json?.data?.inviter ?? json?.inviter;
    if (!inviter?.username) return { status: 'expired' };
    return { status: 'ok', inviter };
  } catch {
    return { status: 'error' };
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const clean = cleanCode(code);
  return {
    title: 'You’re invited',
    description: 'A friend invited you to grow together on Grow!',
    robots: { index: false, follow: false },
    alternates: { canonical: `/i/${clean}` },
    openGraph: {
      title: 'You’re invited to Grow!',
      description: 'A friend invited you to grow together on Grow!',
    },
  };
}

function avatarUrl(avatar: string | null): string | null {
  if (!avatar) return null;
  return /^https:\/\//i.test(avatar) ? avatar : null;
}

export default async function InvitePage({ params }: Props) {
  const { code: rawCode } = await params;
  const code = cleanCode(rawCode);
  const lookup = await lookupInvite(code);
  const appStoreUrl = getAppStoreUrl();
  const openInApp = `growl://invite/${encodeURIComponent(code)}`;

  const inviter = lookup.status === 'ok' ? lookup.inviter : null;
  const photo = inviter ? avatarUrl(inviter.avatar) : null;
  const initial = inviter?.username?.trim().charAt(0).toUpperCase() || 'G';

  return (
    <>
      <SiteNav />
      <main id="main" className="bg-[#f3eee4] pt-16">
        <section className="mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center sm:py-24">
          {lookup.status === 'expired' ? (
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#eae4d6] text-4xl">
                🍂
              </div>
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-800">
                Invite
              </p>
              <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-stone-900">
                This invite has expired
              </h1>
              <p className="mt-4 text-base leading-7 text-stone-600">
                No worries — you can still join Grow! and find your friend by name once you’re in.
              </p>
            </>
          ) : (
            <>
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo}
                  alt=""
                  width={96}
                  height={96}
                  className="h-24 w-24 rounded-full border-4 border-[#fffcf7] object-cover shadow-[0_12px_30px_rgba(28,25,23,0.12)]"
                />
              ) : (
                <div
                  aria-hidden
                  className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-[#fffcf7] bg-emerald-600 font-display text-4xl font-bold text-white shadow-[0_12px_30px_rgba(28,25,23,0.12)]"
                >
                  {inviter ? initial : '🌱'}
                </div>
              )}
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-800">
                You’re invited
              </p>
              <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
                {inviter
                  ? `${inviter.username} invited you to grow together on Grow!`
                  : 'A friend invited you to grow together on Grow!'}
              </h1>
              <p className="mt-4 text-base leading-7 text-stone-600">
                Share small wins on the paths you care about, cheer each other on, and keep a
                gentle streak going — together.
              </p>
            </>
          )}

          <div className="mt-10 w-full rounded-3xl border border-stone-200/80 bg-[#fffcf7] p-6 shadow-[0_8px_30px_rgba(28,25,23,0.05)]">
            {lookup.status !== 'expired' ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                  Your invite code
                </p>
                <p
                  id="invite-code"
                  className="mt-3 select-all font-display text-4xl font-bold tracking-[0.18em] text-emerald-700 sm:text-5xl"
                >
                  {code}
                </p>
                <div className="mt-4 flex justify-center">
                  <CopyCodeButton code={code} />
                </div>
                <p className="mt-4 text-sm text-stone-600">Enter this code when you sign up.</p>
              </>
            ) : null}

            <div className={`flex flex-col gap-3 sm:flex-row ${lookup.status !== 'expired' ? 'mt-6' : ''}`}>
              <a
                href={appStoreUrl}
                className="inline-flex flex-1 items-center justify-center rounded-full bg-emerald-600 px-6 py-3.5 text-base font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                Download on the App Store
              </a>
              {lookup.status !== 'expired' ? (
                <a
                  href={openInApp}
                  className="inline-flex flex-1 items-center justify-center rounded-full border border-stone-300/80 bg-white px-6 py-3.5 text-base font-semibold text-stone-800 transition hover:border-emerald-600/50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                >
                  Open in app
                </a>
              ) : null}
            </div>
            {lookup.status === 'error' ? (
              <p className="mt-4 text-xs text-stone-500">
                We couldn’t check this invite right now, but the code should still work in the app.
              </p>
            ) : null}
          </div>
        </section>
        <SiteFooter />
      </main>
    </>
  );
}
