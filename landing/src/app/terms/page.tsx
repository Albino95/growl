import LegalDocument, { legalMetadata } from '@/components/LegalDocument';

export const metadata = legalMetadata('terms');

export default function TermsPage() {
  return <LegalDocument id="terms" />;
}
