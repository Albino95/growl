import LegalDocument, { legalMetadata } from '@/components/LegalDocument';

export const metadata = legalMetadata('privacy');

export default function PrivacyPage() {
  return <LegalDocument id="privacy" />;
}
