import Hero from '@/components/Hero';
import FeatureSections from '@/components/FeatureSections';
import FaqSection from '@/components/FaqSection';
import SiteFooter from '@/components/SiteFooter';
import SiteNav from '@/components/SiteNav';
import ScrollProgress from '@/components/ScrollProgress';
import { FAQ_ITEMS } from '@/lib/content';
import { faqJsonLd } from '@/lib/seo';

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ_ITEMS)) }}
      />
      <ScrollProgress />
      <SiteNav />
      <main id="main">
        <Hero />
        <FeatureSections />
        <FaqSection />
        <SiteFooter />
      </main>
    </>
  );
}
