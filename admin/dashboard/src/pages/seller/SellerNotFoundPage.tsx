import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { EmptyBlock } from '../../components/seller/SellerUI';

export function SellerNotFoundPage() {
  return (
    <Card className="mt-6">
      <EmptyBlock
        icon={Compass}
        title="This page doesn’t exist"
        description="The link may be old, or this part of the seller portal has moved."
        action={
          <Link to="/seller" className="focus-ring inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Back to dashboard
          </Link>
        }
      />
    </Card>
  );
}
