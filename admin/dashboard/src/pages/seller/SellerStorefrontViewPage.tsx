import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useSellerAuth } from '../../auth/SellerAuthProvider';
import {
  errorMessage,
  getPublicStorefront,
  isFeatureUnavailable,
  normalizeStorefront,
  type PublicStorefront,
} from '../../services/api/sellerApi';
import { formatCount } from '../../lib/sellerFormat';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { ComingSoonBlock, ErrorBlock, LoadingBlock } from '../../components/seller/SellerUI';
import { StorefrontPreview } from './SellerStorefrontPage';

/** The storefront exactly as customers get it from the public API (hidden products excluded). */
export function SellerStorefrontViewPage() {
  const { seller } = useSellerAuth();
  const [data, setData] = useState<PublicStorefront | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [err, setErr] = useState('');
  const businessId = seller?.userId && seller.userId !== 'unknown' ? seller.userId : null;

  const load = useCallback(async () => {
    if (!businessId) {
      setErr('Sign out and back in to view your public page.');
      setState('error');
      return;
    }
    setState('loading');
    try {
      setData(await getPublicStorefront(businessId));
      setState('ready');
    } catch (e) {
      if (isFeatureUnavailable(e)) setState('unavailable');
      else {
        setErr(errorMessage(e, 'Failed to load your public page'));
        setState('error');
      }
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Your public storefront"
        subtitle="This is what people see in the Grow! app. Hidden products never appear here."
        action={
          <div className="flex gap-2">
            <Link to="/seller/storefront" className="focus-ring inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-surface-page">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </Link>
            <Link to="/seller/storefront" className="focus-ring inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              <Pencil className="h-4 w-4" aria-hidden /> Edit
            </Link>
          </div>
        }
      />
      {state === 'loading' ? (
        <Card className="!p-0">
          <LoadingBlock rows={4} />
        </Card>
      ) : state === 'unavailable' ? (
        <Card>
          <ComingSoonBlock feature="Your public storefront" />
        </Card>
      ) : state === 'error' || !data ? (
        <Card>
          <ErrorBlock message={err} onRetry={businessId ? () => void load() : undefined} />
        </Card>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-stone-600">
            {formatCount(data.products_count)} products in your shop
            {data.business.followers_count !== undefined ? ` · ${formatCount(data.business.followers_count)} followers` : ''}
          </p>
          <StorefrontPreview
            storefront={normalizeStorefront(data.storefront)}
            name={data.business.name}
            logo={data.business.logo_url}
            verified={data.business.verified}
            featured={data.featured_products || []}
          />
        </div>
      )}
    </div>
  );
}
