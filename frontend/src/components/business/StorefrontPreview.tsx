import React from 'react';
import { View, Text, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { formatCurrency } from '../../utils/money';
import type { BusinessProduct } from '../../services/api/business';

type Props = {
  visible: boolean;
  onClose: () => void;
  businessName: string;
  logoUrl?: string | null;
  shippingNote?: string;
  products: BusinessProduct[];
};

/**
 * "How customers see you": the seller's storefront as a shopper sees it — only visible
 * products, sold-out labels, the shipping note. Read-only.
 */
export default function StorefrontPreview({
  visible,
  onClose,
  businessName,
  logoUrl,
  shippingNote,
  products,
}: Props) {
  const visibleProducts = products.filter((p) => !p.is_hidden);
  const hiddenCount = products.length - visibleProducts.length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top', 'bottom']}>
        <View style={tw`flex-row items-center justify-between px-gutter py-3 border-b border-line`}>
          <View style={tw`w-14`} />
          <Text style={tw`text-callout font-semibold text-ink`} accessibilityRole="header">
            Customer view
          </Text>
          <PressableScale
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close customer view"
            style={tw`w-14 items-end`}
          >
            <Text style={tw`text-body font-semibold text-emerald-700`}>Done</Text>
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={tw`px-gutter pt-4 pb-10`}>
          <View style={tw`flex-row items-center mb-3`}>
            {logoUrl ? (
              <Image
                source={{ uri: logoUrl }}
                style={tw`w-14 h-14 rounded-full mr-3`}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View style={tw`w-14 h-14 rounded-full mr-3 bg-raised items-center justify-center`}>
                <Ionicons name="storefront-outline" size={24} color={theme.colors.iconMuted} />
              </View>
            )}
            <View style={tw`flex-1`}>
              <Text style={tw`text-title font-bold text-ink`} numberOfLines={1}>
                {businessName || 'Your store'}
              </Text>
              <Text style={tw`text-footnote text-ink-3`}>
                {visibleProducts.length} product{visibleProducts.length === 1 ? '' : 's'}
              </Text>
            </View>
          </View>

          {shippingNote ? (
            <View style={tw`flex-row items-start bg-raised rounded-control px-3 py-2.5 mb-3`}>
              <Ionicons name="cube-outline" size={16} color={theme.colors.ink3} style={tw`mr-2 mt-0.5`} />
              <Text style={tw`flex-1 text-footnote text-ink-2`}>{shippingNote}</Text>
            </View>
          ) : null}

          {hiddenCount > 0 ? (
            <Text style={tw`text-footnote text-amber-700 mb-3`}>
              {hiddenCount} product{hiddenCount === 1 ? ' is' : 's are'} hidden from the shop and not shown here.
            </Text>
          ) : null}

          {visibleProducts.length === 0 ? (
            <View style={tw`items-center py-10`}>
              <Ionicons name="bag-outline" size={32} color={theme.colors.iconMuted} />
              <Text style={tw`text-body text-ink-2 mt-2 text-center`}>
                Customers would see an empty shelf. Add a product to fill it.
              </Text>
            </View>
          ) : (
            <View style={tw`flex-row flex-wrap -mx-1.5`}>
              {visibleProducts.map((p) => {
                const soldOut = Number(p.stock) <= 0;
                return (
                  <View
                    key={p.id}
                    style={tw`w-1/2 px-1.5 mb-3`}
                    accessible
                    accessibilityLabel={`${p.name}, ${formatCurrency(Number(p.price || 0))}${soldOut ? ', sold out' : ''}${p.image_url ? '' : ', no photo'}`}
                  >
                    <View style={tw`bg-card border border-line rounded-card overflow-hidden`}>
                      {p.image_url ? (
                        <Image source={{ uri: p.image_url }} style={tw`w-full h-32`} contentFit="cover" />
                      ) : (
                        <View style={tw`w-full h-32 bg-raised items-center justify-center`}>
                          <Ionicons name="image-outline" size={26} color={theme.colors.iconMuted} />
                          <Text style={tw`text-caption text-ink-3 mt-1`}>No photo</Text>
                        </View>
                      )}
                      <View style={tw`p-2.5`}>
                        <Text style={tw`text-footnote font-semibold text-ink`} numberOfLines={2}>
                          {p.name}
                        </Text>
                        <View style={tw`flex-row items-center justify-between mt-1`}>
                          <Text style={tw`text-footnote font-bold text-ink`}>
                            {formatCurrency(Number(p.price || 0))}
                          </Text>
                          {soldOut ? (
                            <Text style={tw`text-caption font-semibold text-red-600`}>Sold out</Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
