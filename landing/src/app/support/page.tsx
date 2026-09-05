import LegalDocument, { legalMetadata } from '@/components/LegalDocument';

export const metadata = legalMetadata('support');

export default function SupportPage() {
  return <LegalDocument id="support" />;
}
