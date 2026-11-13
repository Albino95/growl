import Hero from '@/components/Hero';
import WeekDays from '@/components/WeekDays';
import WeekRail from '@/components/WeekRail';
import SiteNav from '@/components/SiteNav';
import SiteFooter from '@/components/SiteFooter';
import { Faq, FinalCta, MadeIn, PrivacyPromise } from '@/components/Closing';
import { StickyGetBar } from '@/components/MobileCta';
import { faqJsonLd, faqItems } from '@/lib/seo';

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(faqItems)) }}
      />
      <SiteNav />
      <main id="main" className="pt-16">
        <Hero />
        <div className="relative border-t border-line">
          <WeekRail />
          <WeekDays />
        </div>
        <PrivacyPromise />
        <Faq />
        <MadeIn />
        <FinalCta />
      </main>
      <SiteFooter />
      <StickyGetBar />
    </>
  );
}
