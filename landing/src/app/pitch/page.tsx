import type { Metadata } from 'next';
import InvestorPitchDeck from '@/components/pitch/InvestorPitchDeck';

export const metadata: Metadata = {
  title: 'Investor pitch',
  description: 'Grow! confidential investor overview — unlock skills, share your growth.',
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function PitchPage() {
  return <InvestorPitchDeck />;
}
