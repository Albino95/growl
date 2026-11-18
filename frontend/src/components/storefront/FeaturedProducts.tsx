import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import GrowImage from '../ui/GrowImage';
import { formatCurrency } from '../../utils/money';
import { resolveProductImageUri } from '../../utils/images';
import { horizontalScrollProps } from '../../constants/scroll';
import type { StorefrontProduct } from '../../services/api/storefront';

type TileProps = {
  product: StorefrontProduct;
  onPress?: (p: StorefrontProduct) => void;
  /** Fixed width for horizontal rails; omit to fill a grid cell. */
  width?: number;
};

function productCurrency(p: StorefrontProduct): string | undefined {
  const c = (p.metadata as Record<string, unknown> | undefined)?.currency;
  return typeof c === 'string' && c ? c : undefined;
}

/** Shop product card: photo, name, price, sold-out label. */
export function ProductTile({ product, onPress, width }: TileProps) {
  const uri = resolveProductImageUri(product.image_url, product.images);
  const soldOut = product.sold_out ?? Number(product.stock) <= 0;
  const price = formatCurrency(Number(product.price || 0), productCurrency(product));
  return (
    <PressableScale
      disabled={!onPress}
      onPress={() => onPress?.(product)}
      style={[tw`bg-card border border-line rounded-card overflow-hidden`, width ? { width } : null]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${product.name}, ${price}${soldOut ? ', sold out' : ''}`}
    >
      {uri ? (
        <GrowImage source={{ uri }} style={tw`w-full h-32 bg-raised`} contentFit="cover" />
      ) : (
        <View style={tw`w-full h-32 bg-raised items-center justify-center`}>
          <Ionicons name="image-outline" size={26} color={theme.colors.iconMuted} />
        </View>
      )}
      <View style={tw`p-2.5`}>
        <Text style={tw`text-footnote font-semibold text-ink`} numberOfLines={2}>
          {product.name}
        </Text>
        <View style={tw`flex-row items-center justify-between mt-1`}>
          <Text style={tw`text-footnote font-bold text-ink`}>{price}</Text>
          {soldOut ? <Text style={tw`text-caption font-semibold text-red-600`}>Sold out</Text> : null}
        </View>
      </View>
    </PressableScale>
  );
}

/** Two-column grid of product tiles. */
export function ProductGrid({
  products,
  onPress,
}: {
  products: StorefrontProduct[];
  onPress?: (p: StorefrontProduct) => void;
}) {
  return (
    <View style={tw`flex-row flex-wrap -mx-1.5`}>
      {products.map((p) => (
        <View key={p.id} style={tw`w-1/2 px-1.5 mb-3`}>
          <ProductTile product={p} onPress={onPress} />
        </View>
      ))}
    </View>
  );
}

type Props = {
  products: StorefrontProduct[];
  onPress?: (p: StorefrontProduct) => void;
  title?: string;
};

/** "Featured" rail: the seller's hand-picked products (≤ 6), in their order. */
export default function FeaturedProducts({ products, onPress, title = 'Featured' }: Props) {
  if (!products.length) return null;
  return (
    <View>
      <Text style={tw`px-gutter text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
        {title}
      </Text>
      <ScrollView
        horizontal
        {...horizontalScrollProps}
        contentContainerStyle={tw`px-gutter`}
      >
        {products.map((p, i) => (
          <View key={p.id} style={tw`${i < products.length - 1 ? 'mr-3' : ''}`}>
            <ProductTile product={p} onPress={onPress} width={152} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
