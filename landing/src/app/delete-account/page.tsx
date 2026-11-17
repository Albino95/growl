import LegalDocument, { legalMetadata } from '@/components/LegalDocument';

export const metadata = legalMetadata('delete-account');

export default function DeleteAccountPage() {
  return <LegalDocument id="delete-account" />;
}
