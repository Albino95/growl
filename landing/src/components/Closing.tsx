import AppStoreBadge from './AppStoreBadge';
import { faqItems } from '@/lib/seo';
import { SUPPORT_EMAIL } from '@/lib/content';

const WRAP = 'mx-auto max-w-6xl px-5 sm:px-8 lg:pl-36 lg:pr-10';

export function PrivacyPromise() {
  return (
    <section aria-labelledby="privacy-title" className="border-t border-line">
      <div className={`${WRAP} py-20 lg:py-24`}>
        <h2 id="privacy-title" className="display text-[1.75rem] text-bark sm:text-[2.5rem]">
          What we won’t do with your week.
        </h2>
        <ul className="mt-8 max-w-2xl divide-y divide-line border-y border-line font-display text-[1.375rem] font-semibold leading-snug tracking-[-0.01em] text-bark sm:text-[1.75rem]">
          <li className="py-4">No third-party ads.</li>
          <li className="py-4">We don’t sell your data.</li>
          <li className="py-4">Your journal is private unless you share an entry.</li>
          <li className="py-4">You can delete your account anytime.</li>
        </ul>
        <p className="measure mt-6 text-[1.0625rem] text-moss">
          The details are in our{' '}
          <a href="/privacy" className="font-semibold text-leaf underline decoration-leaf/30 underline-offset-4 hover:decoration-leaf">
            privacy policy
          </a>
          . To delete your account, use the app or{' '}
          <a href="/delete-account" className="font-semibold text-leaf underline decoration-leaf/30 underline-offset-4 hover:decoration-leaf">
            letsgrow.lu/delete-account
          </a>
          .
        </p>
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section aria-labelledby="faq-title" id="faq" className="border-t border-line">
      <div className={`${WRAP} py-20 lg:py-24`}>
        <h2 id="faq-title" className="display text-[1.75rem] text-bark sm:text-[2.5rem]">
          Questions
        </h2>
        <div className="mt-8 max-w-3xl border-t border-line">
          {faqItems.map((item) => (
            <details key={item.question} className="group border-b border-line">
              <summary className="flex min-h-[56px] cursor-pointer items-center justify-between gap-6 py-4 text-left">
                <span className="text-[1.125rem] font-semibold text-bark">{item.question}</span>
                <span
                  aria-hidden="true"
                  className="faq-plus relative h-4 w-4 shrink-0 transition-transform duration-200 before:absolute before:left-0 before:top-1/2 before:h-[2px] before:w-4 before:-translate-y-1/2 before:bg-bark after:absolute after:left-1/2 after:top-0 after:h-4 after:w-[2px] after:-translate-x-1/2 after:bg-bark"
                />
              </summary>
              <p className="measure pb-5 pr-10 text-[1.0625rem] text-moss">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MadeIn() {
  return (
    <section aria-labelledby="made-title" className="border-t border-line">
      <div className={`${WRAP} py-16`}>
        <h2 id="made-title" className="font-display text-[1.375rem] font-bold tracking-[-0.01em] text-bark">
          Made in Luxembourg
        </h2>
        <p className="measure mt-2 text-[1.0625rem] text-moss">
          Grow! is built by a small team in Luxembourg. If something is confusing, broken or missing,
          tell us at{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-semibold text-leaf underline decoration-leaf/30 underline-offset-4 hover:decoration-leaf"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section id="get-grow" aria-labelledby="final-title" className="border-t border-line">
      <div className="mx-auto flex max-w-3xl flex-col items-center px-5 py-24 text-center sm:py-32">
        <h2 id="final-title" className="display text-[clamp(2.75rem,6vw,5rem)] text-bark">
          <span className="block">Let’s grow.</span>
          <span className="block">Day 1 is today.</span>
        </h2>
        <p className="mt-4 text-[1.125rem] text-moss">
          Making your life better, a little each day. Free on iPhone, ten seconds a day.
        </p>
        <div className="mt-8">
          <AppStoreBadge className="h-[56px]" />
        </div>
        <p className="mt-6 text-[0.9375rem] text-moss">
          On Android?{' '}
          <a href="#android" className="font-semibold text-leaf underline decoration-leaf/30 underline-offset-4 hover:decoration-leaf">
            Leave your email
          </a>{' '}
          and we’ll write once, when it’s ready.
        </p>
      </div>
    </section>
  );
}
