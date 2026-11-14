import LegalDocument, { legalMetadata } from '@/components/LegalDocument';

export const metadata = legalMetadata('community');

export default function CommunityPage() {
  return <LegalDocument id="community" />;
}
