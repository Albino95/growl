import React from 'react';
import BrandLoadingScreen, { type BrandLoadingVariant } from './BrandLoadingScreen';

type Props = {
  message?: string;
  variant?: BrandLoadingVariant;
};

/** App bootstrap / full-screen gate — animated Grow! brand loader. */
export default function FullScreenLoader({
  message = 'Getting things ready…',
  variant = 'splash',
}: Props) {
  return <BrandLoadingScreen variant={variant} message={message} showWordmark />;
}
