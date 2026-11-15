import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  RefreshControl,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../../components/ui/PressableScale';
import { iconSize } from '../../theme/icons';
import ErrorState from '../../components/ui/ErrorState';
import { useRefresh } from '../../hooks/useRefresh';
import { formInputAccessoryProps } from '../../components/ui/KeyboardDoneAccessory';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { feedListPerformanceProps } from '../../constants/scroll';
import { createProduct, updateProduct, deleteProduct } from '../../services/api/marketplace';
import ProductForm from '../../components/business/ProductForm';
import StockBadge from '../../components/business/StockBadge';
import BusinessEmptyState from '../../components/business/BusinessEmptyState';
import BusinessStatStrip from '../../components/business/BusinessStatStrip';
import BusinessScreen from '../../components/business/BusinessScreen';
import StorefrontPreview from '../../components/business/StorefrontPreview';
import SkeletonCard from '../../components/ui/SkeletonCard';
import CATEGORIES from '../../data/categories';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  fetchBusinessDashboard,
  fetchBusinessProducts,
  fetchBusinessSettings,
  setCatalogFilter,
} from '../../store/slices/businessSlice';
import { formatCurrency } from '../../utils/money';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { toast } from '../../state/useToastStore';
import { haptic } from '../../theme/haptics';
import type { BusinessTabsParamList } from '../../app/navigation/tabs/BusinessTabs';
import {
  bulkUpdateBusinessProducts,
  duplicateBusinessProduct,
  type BusinessProduct,
} from '../../services/api/business';
import { BULK_EDIT_MAX, bulkChanges, type BulkEditDraft } from '../../services/api/businessHelpers';

const FILTER_LABEL = { all: 'All', low: 'Low stock', out: 'Sold out' } as const;

export default function InventoryScreen() {
  const route = useRoute<RouteProp<BusinessTabsParamList, 'Catalog'>>();
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const products = useAppSelector((s) => s.business.products);
  const catalogFilter = useAppSelector((s) => s.business.catalogFilter);
  const productsStatus = useAppSelector((s) => s.business.productsStatus);
  const settings = useAppSelector((s) => s.business.settings);
  const threshold = useAppSelector((s) => s.business.kpis?.low_stock_threshold) ?? 10;

  const [searchQuery, setSearchQuery] = useState('');
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<BusinessProduct | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkDraft, setBulkDraft] = useState<BulkEditDraft>({});
  const [bulkErrors, setBulkErrors] = useState<Record<string, string>>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    void dispatch(fetchBusinessProducts());
  }, [dispatch]);

  useEffect(() => {
    if (route.params?.openForm) {
      setEditingProduct(null);
      setShowProductForm(true);
      navigation.setParams({ openForm: undefined });
    }
  }, [route.params?.openForm, navigation]);

  const refresh = useRefresh(() => dispatch(fetchBusinessProducts()));

  // Catalog changes affect dashboard KPIs (stock, inventory value, low-stock alerts).
  const refreshAfterCatalogChange = async () => {
    await dispatch(fetchBusinessProducts());
    void dispatch(fetchBusinessDashboard({ force: true, silent: true }));
  };

  const openNewProduct = () => {
    setEditingProduct(null);
    setShowProductForm(true);
  };

  const handleCreateProduct = async (productData: Parameters<typeof createProduct>[0]) => {
    await createProduct(productData);
    await refreshAfterCatalogChange();
    toast.success('Product created');
  };

  const handleUpdateProduct = async (productData: Parameters<typeof updateProduct>[1]) => {
    if (!editingProduct) return;
    await updateProduct(editingProduct.id, productData);
    await refreshAfterCatalogChange();
    setEditingProduct(null);
    toast.success('Product updated');
  };

  const handleDuplicate = async (product: BusinessProduct) => {
    setBusyId(product.id);
    try {
      const copy = await duplicateBusinessProduct(product.id);
      await refreshAfterCatalogChange();
      haptic('success');
      toast.success(`Duplicated as “${copy.name}” — stock starts at 0`);
      setEditingProduct(copy);
      setShowProductForm(true);
    } catch (e: unknown) {
      alertMessage('Couldn’t duplicate', e instanceof Error ? e.message : 'Try again in a moment.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteProduct = async (product: BusinessProduct) => {
    const ok = await confirmAsync(
      'Remove product',
      `Remove “${product.name}” from your catalog? Customers won't see it any more. Past orders keep their details.`,
      { confirmLabel: 'Remove', destructive: true }
    );
    if (!ok) return;
    setBusyId(product.id);
    try {
      await deleteProduct(product.id);
      await refreshAfterCatalogChange();
      toast.success('Product removed');
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Failed to remove');
    } finally {
      setBusyId(null);
    }
  };

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((product) => {
      const sku = `PRD-${product.id.slice(-6).toUpperCase()}`;
      const matchesSearch =
        !q ||
        product.name.toLowerCase().includes(q) ||
        sku.toLowerCase().includes(q) ||
        product.category.toLowerCase().includes(q);
      const matchesFilter =
        catalogFilter === 'all' ||
        (catalogFilter === 'low' && product.stock > 0 && product.stock < threshold) ||
        (catalogFilter === 'out' && product.stock <= 0);
      return matchesSearch && matchesFilter;
    });
  }, [products, searchQuery, catalogFilter, threshold]);

  const totalValue = products.reduce((sum, p) => sum + p.stock * p.price, 0);
  const lowStockCount = products.filter((p) => p.stock > 0 && p.stock < threshold).length;
  const outCount = products.filter((p) => p.stock <= 0).length;
  const categoryName = useCallback(
    (catId: string) => CATEGORIES.find((c) => c.key === catId)?.label || catId,
    []
  );
  const loading = productsStatus === 'loading' && products.length === 0;
  const loadFailed = productsStatus === 'failed' && products.length === 0;

  // ---- bulk edit ----
  const bulkPending = useMemo(() => bulkChanges(products, bulkDraft), [products, bulkDraft]);

  const exitBulk = () => {
    setBulkMode(false);
    setBulkDraft({});
    setBulkErrors({});
  };

  const toggleBulk = async () => {
    if (!bulkMode) {
      setBulkMode(true);
      return;
    }
    if (bulkPending.items.length > 0) {
      const discard = await confirmAsync('Discard changes?', 'Your price and stock edits haven’t been saved.', {
        confirmLabel: 'Discard',
        destructive: true,
      });
      if (!discard) return;
    }
    exitBulk();
  };

  const setBulkField = (id: string, field: 'price' | 'stock', value: string) => {
    setBulkDraft((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));
    if (bulkErrors[id]) setBulkErrors(({ [id]: _drop, ...rest }) => rest);
  };

  const saveBulk = async () => {
    const { items, errors } = bulkPending;
    setBulkErrors(errors);
    if (Object.keys(errors).length > 0) {
      haptic('error');
      return;
    }
    if (items.length === 0) {
      exitBulk();
      return;
    }
    if (items.length > BULK_EDIT_MAX) {
      alertMessage('Too many changes', `Save at most ${BULK_EDIT_MAX} products at a time.`);
      return;
    }
    setBulkSaving(true);
    try {
      const res = await bulkUpdateBusinessProducts(items);
      await refreshAfterCatalogChange();
      haptic('success');
      toast.success(`Updated ${res.updated} product${res.updated === 1 ? '' : 's'}`);
      exitBulk();
    } catch (e: unknown) {
      alertMessage('Couldn’t save', e instanceof Error ? e.message : 'Try again in a moment.');
    } finally {
      setBulkSaving(false);
    }
  };

  const openPreview = () => {
    if (!settings) void dispatch(fetchBusinessSettings());
    setPreviewOpen(true);
  };

  const renderBulkRow = (product: BusinessProduct) => {
    const d = bulkDraft[product.id] || {};
    const err = bulkErrors[product.id];
    const fieldStyle = tw`bg-card border ${err ? 'border-red-500' : 'border-line'} rounded-control px-3 py-2 text-body text-ink`;
    return (
      <View style={tw`py-3 border-b border-line/70`}>
        <Text style={tw`text-body font-semibold text-ink mb-2`} numberOfLines={1}>
          {product.name}
        </Text>
        <View style={tw`flex-row gap-3`}>
          <View style={tw`flex-1`}>
            <Text style={tw`text-caption text-ink-3 mb-1`}>Price (€)</Text>
            <TextInput
              {...formInputAccessoryProps()}
              value={d.price ?? String(product.price ?? '')}
              onChangeText={(v) => setBulkField(product.id, 'price', v)}
              keyboardType="decimal-pad"
              style={fieldStyle}
              accessibilityLabel={`Price for ${product.name}`}
            />
          </View>
          <View style={tw`flex-1`}>
            <Text style={tw`text-caption text-ink-3 mb-1`}>Stock</Text>
            <TextInput
              {...formInputAccessoryProps()}
              value={d.stock ?? String(product.stock ?? '')}
              onChangeText={(v) => setBulkField(product.id, 'stock', v)}
              keyboardType="number-pad"
              style={fieldStyle}
              accessibilityLabel={`Stock for ${product.name}`}
            />
          </View>
        </View>
        {err ? (
          <Text style={tw`text-footnote text-red-600 mt-1`} accessibilityLiveRegion="polite">
            {err}
          </Text>
        ) : null}
      </View>
    );
  };

  const renderProduct = ({ item: product }: { item: BusinessProduct }) => {
    if (bulkMode) return renderBulkRow(product);
    const sku = `PRD-${product.id.slice(-6).toUpperCase()}`;
    const hidden = Boolean(product.is_hidden);
    const busy = busyId === product.id;
    return (
      <View style={tw`py-4 border-b border-line/70 ${busy ? 'opacity-60' : ''}`}>
        <View style={tw`flex-row items-start`}>
          {product.image_url ? (
            <Image
              source={{ uri: product.image_url }}
              style={tw`w-14 h-14 rounded-control mr-3`}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View
              style={tw`w-14 h-14 rounded-control mr-3 bg-raised items-center justify-center`}
              accessible
              accessibilityLabel="No photo"
            >
              <Ionicons name="image-outline" size={iconSize.md} color={theme.colors.iconMuted} />
            </View>
          )}
          <View style={tw`flex-1`}>
            <View style={tw`flex-row items-start justify-between`}>
              <Text style={tw`text-base font-bold text-ink flex-1 pr-2`}>{product.name}</Text>
              <StockBadge stock={product.stock} threshold={threshold} />
            </View>
            <Text style={tw`text-sm text-ink-3 mt-1`}>
              {sku} · {categoryName(product.category)}
              {product.units_sold != null ? ` · ${product.units_sold} sold this month` : ''}
            </Text>
            <Text style={tw`text-lg font-bold text-ink mt-1.5`}>{formatCurrency(Number(product.price || 0))}</Text>
            {hidden ? (
              <View style={tw`flex-row items-center mt-1.5`}>
                <Ionicons name="eye-off-outline" size={14} color={tw.color('amber-700')} />
                <Text style={tw`text-footnote text-amber-700 ml-1 flex-1`}>
                  Hidden from the shop after a review. Contact support if you think this is a mistake.
                </Text>
              </View>
            ) : !product.image_url ? (
              <Text style={tw`text-footnote text-ink-3 mt-1`}>Tip: add a photo — it’s what shoppers tap on.</Text>
            ) : null}
          </View>
        </View>
        <View style={tw`flex-row gap-2 mt-3`}>
          <View style={tw`flex-1`}>
            <PrimaryButton
              label="Edit"
              accessibilityLabel={`Edit ${product.name}`}
              disabled={busy}
              onPress={() => {
                setEditingProduct(product);
                setShowProductForm(true);
              }}
            />
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Duplicate ${product.name}`}
            disabled={busy}
            style={tw`px-4 py-2.5 bg-raised border border-line rounded-control items-center justify-center`}
            onPress={() => void handleDuplicate(product)}
          >
            <Ionicons name="copy-outline" size={iconSize.sm} color={theme.colors.ink2} />
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Remove ${product.name}`}
            disabled={busy}
            style={tw`px-4 py-2.5 bg-red-50 rounded-control items-center justify-center`}
            onPress={() => void handleDeleteProduct(product)}
          >
            <Ionicons name="trash-outline" size={iconSize.sm} color={theme.colors.danger} />
          </PressableScale>
        </View>
      </View>
    );
  };

  const emptyTitle = searchQuery
    ? 'No matches'
    : catalogFilter === 'low'
      ? 'Nothing running low'
      : catalogFilter === 'out'
        ? 'Nothing sold out'
        : 'No products yet';
  const emptyDescription = searchQuery
    ? 'Try a different name, SKU or category.'
    : catalogFilter !== 'all'
      ? `Products under your alert threshold (${threshold}) show here.`
      : 'Add your first product — customers can browse it in the shop right away.';

  return (
    <BusinessScreen
      title="Catalog"
      subtitle="Products, stock, and storefront SKUs"
      onSettings={() => navigation.getParent()?.navigate('BusinessSettings')}
      onMessages={() => navigation.getParent()?.navigate('BusinessMessages')}
      headerRight={
        <View style={tw`flex-row items-center gap-2`}>
          <PressableScale
            pressedScale={0.9}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Preview your store as a customer"
            onPress={openPreview}
            style={tw`w-9 h-9 rounded-full bg-raised border border-line/80 items-center justify-center`}
          >
            <Ionicons name="eye-outline" size={19} color={theme.colors.brand} />
          </PressableScale>
          <PressableScale
            pressedScale={0.9}
            hitSlop={8}
            accessibilityRole="button"
            onPress={openNewProduct}
            style={tw`w-9 h-9 rounded-full bg-raised border border-line/80 items-center justify-center`}
            accessibilityLabel="Add product"
          >
            <Ionicons name="add" size={20} color={theme.colors.brand} />
          </PressableScale>
        </View>
      }
    >
      <View style={tw`px-gutter-wide pb-3`}>
        <View style={tw`relative mb-3`}>
          <Ionicons name="search" size={iconSize.sm} color={theme.colors.iconMuted} style={tw`absolute left-3.5 top-3.5 z-10`} />
          <TextInput
            {...formInputAccessoryProps()}
            placeholder="Search name, SKU or category…"
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={tw`bg-card border border-line/80 rounded-card pl-10 pr-4 py-3 text-base text-ink`}
            placeholderTextColor={theme.colors.ink3}
            accessibilityLabel="Search products"
          />
        </View>
        <BusinessStatStrip
          items={[
            { label: 'Products', value: String(products.length), tone: 'emerald' },
            { label: 'Low / out', value: `${lowStockCount} / ${outCount}`, tone: 'amber' },
            { label: 'Stock value', value: formatCurrency(Math.round(totalValue)), tone: 'stone' },
          ]}
        />
        <View style={tw`flex-row items-center gap-2 mt-3`}>
          {(['all', 'low', 'out'] as const).map((f) => (
            <PressableScale
              key={f}
              onPress={() => dispatch(setCatalogFilter(f))}
              accessibilityRole="button"
              accessibilityState={{ selected: catalogFilter === f }}
              style={tw`px-3.5 py-2 rounded-chip ${
                catalogFilter === f ? 'bg-emerald-600' : 'bg-raised/80 border border-line/60'
              }`}
            >
              <Text
                style={tw`text-sm font-semibold ${
                  catalogFilter === f ? 'text-white' : 'text-ink-2'
                }`}
              >
                {FILTER_LABEL[f]}
              </Text>
            </PressableScale>
          ))}
          <View style={tw`flex-1`} />
          {products.length > 0 ? (
            <PressableScale
              onPress={() => void toggleBulk()}
              accessibilityRole="button"
              accessibilityLabel={bulkMode ? 'Cancel quick edit' : 'Quick edit prices and stock'}
              hitSlop={8}
            >
              <Text style={tw`text-sm font-semibold text-emerald-700`}>
                {bulkMode ? 'Cancel' : 'Quick edit'}
              </Text>
            </PressableScale>
          ) : null}
        </View>
      </View>

      <FlatList
        style={tw`flex-1`}
        data={filteredProducts}
        keyExtractor={(item) => item.id}
        renderItem={renderProduct}
        extraData={[bulkMode, bulkDraft, bulkErrors, busyId]}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          tw`px-gutter-wide pt-1`,
          filteredProducts.length === 0 ? tw`flex-grow` : null,
          { paddingBottom: 24 },
        ]}
        refreshControl={
          <RefreshControl {...refresh} />
        }
        {...feedListPerformanceProps}
        ListEmptyComponent={
          loading ? (
            <View>
              <SkeletonCard variant="product" />
              <SkeletonCard variant="product" />
            </View>
          ) : loadFailed ? (
            <ErrorState
              title="Couldn’t load products"
              onRetry={() => void dispatch(fetchBusinessProducts())}
            />
          ) : (
            <BusinessEmptyState
              icon="cube-outline"
              title={emptyTitle}
              description={emptyDescription}
              actionLabel={!searchQuery && catalogFilter === 'all' ? 'Add product' : undefined}
              onAction={!searchQuery && catalogFilter === 'all' ? openNewProduct : undefined}
            />
          )
        }
      />

      <View style={tw`px-gutter-wide pb-4 pt-2 border-t border-line/60 bg-page`}>
        {bulkMode ? (
          <PrimaryButton
            label={
              bulkSaving
                ? 'Saving…'
                : bulkPending.items.length > 0
                  ? `Save ${bulkPending.items.length} change${bulkPending.items.length === 1 ? '' : 's'}`
                  : 'No changes yet'
            }
            onPress={() => void saveBulk()}
            loading={bulkSaving}
            disabled={bulkSaving || (bulkPending.items.length === 0 && Object.keys(bulkPending.errors).length === 0)}
          />
        ) : (
          <PrimaryButton label="Add product" onPress={openNewProduct} />
        )}
      </View>

      <ProductForm
        visible={showProductForm}
        product={editingProduct}
        onClose={() => {
          setShowProductForm(false);
          setEditingProduct(null);
        }}
        onSubmit={editingProduct ? handleUpdateProduct : handleCreateProduct}
      />

      <StorefrontPreview
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
        businessName={settings?.business_name || ''}
        logoUrl={settings?.logo_url}
        shippingNote={String((settings?.analytics_prefs as Record<string, unknown> | undefined)?.default_shipping_note ?? '')}
        products={products}
      />
    </BusinessScreen>
  );
}
