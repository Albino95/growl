import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRoute, type RouteProp } from '@react-navigation/native';
import tw from '../../lib/tw';
import { verticalScrollProps } from '../../constants/scroll';
import { createProduct, updateProduct, deleteProduct } from '../../services/api/marketplace';
import ProductForm from '../../components/business/ProductForm';
import StockBadge from '../../components/business/StockBadge';
import BusinessEmptyState from '../../components/business/BusinessEmptyState';
import CATEGORIES from '../../data/categories';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchBusinessProducts, setCatalogFilter } from '../../store/slices/businessSlice';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import type { BusinessTabsParamList } from '../../app/navigation/tabs/BusinessTabs';

export default function InventoryScreen() {
  const route = useRoute<RouteProp<BusinessTabsParamList, 'Catalog'>>();
  const dispatch = useAppDispatch();
  const products = useAppSelector((s) => s.business.products);
  const catalogFilter = useAppSelector((s) => s.business.catalogFilter);
  const productsStatus = useAppSelector((s) => s.business.productsStatus);
  const threshold = useAppSelector((s) => s.business.kpis?.low_stock_threshold) ?? 10;

  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<(typeof products)[0] | null>(null);

  useEffect(() => {
    void dispatch(fetchBusinessProducts());
  }, [dispatch]);

  useEffect(() => {
    if (route.params?.openForm) {
      setEditingProduct(null);
      setShowProductForm(true);
    }
  }, [route.params?.openForm]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchBusinessProducts());
    setRefreshing(false);
  };

  const handleCreateProduct = async (productData: Parameters<typeof createProduct>[0]) => {
    await createProduct(productData);
    await dispatch(fetchBusinessProducts());
    alertMessage('Saved', 'Product created successfully');
  };

  const handleUpdateProduct = async (productData: Parameters<typeof updateProduct>[1]) => {
    if (!editingProduct) return;
    await updateProduct(editingProduct.id, productData);
    await dispatch(fetchBusinessProducts());
    setEditingProduct(null);
    alertMessage('Saved', 'Product updated successfully');
  };

  const handleDeleteProduct = async (product: (typeof products)[0]) => {
    const ok = await confirmAsync('Delete product', `Delete "${product.name}"? This cannot be undone.`, {
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteProduct(product.id);
      await dispatch(fetchBusinessProducts());
      alertMessage('Deleted', 'Product removed');
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const sku = `PRD-${product.id.slice(-6).toUpperCase()}`;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        product.name.toLowerCase().includes(q) ||
        sku.toLowerCase().includes(q) ||
        product.category.toLowerCase().includes(q);
      const matchesFilter =
        catalogFilter === 'all' ||
        (catalogFilter === 'low' && product.stock > 0 && product.stock < threshold) ||
        (catalogFilter === 'out' && product.stock === 0);
      return matchesSearch && matchesFilter;
    });
  }, [products, searchQuery, catalogFilter, threshold]);

  const totalValue = products.reduce((sum, p) => sum + p.stock * p.price, 0);
  const lowStockCount = products.filter((p) => p.stock > 0 && p.stock < threshold).length;
  const categoryName = (catId: string) => CATEGORIES.find((c) => c.key === catId)?.label || catId;
  const loading = productsStatus === 'loading' && products.length === 0;

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top']}>
      <View style={tw`bg-white px-4 pt-3 pb-3 border-b border-stone-100`}>
        <Text style={tw`text-2xl font-bold text-stone-900 mb-3 tracking-tight`}>Catalog</Text>
        <View style={tw`relative mb-3`}>
          <Ionicons name="search" size={20} color="#9CA3AF" style={tw`absolute left-3 top-3 z-10`} />
          <TextInput
            placeholder="Search products by name or SKU..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={tw`bg-stone-100 rounded-lg pl-10 pr-4 py-2.5 text-base`}
            placeholderTextColor="#9CA3AF"
          />
        </View>
        <View style={tw`flex-row gap-3 mb-3`}>
          <View style={tw`flex-1 bg-emerald-50 rounded-lg p-3`}>
            <Text style={tw`text-xs text-emerald-700 mb-1`}>Products</Text>
            <Text style={tw`text-xl font-bold text-emerald-900`}>{products.length}</Text>
          </View>
          <View style={tw`flex-1 bg-amber-50 rounded-lg p-3`}>
            <Text style={tw`text-xs text-amber-700 mb-1`}>Low stock</Text>
            <Text style={tw`text-xl font-bold text-amber-900`}>{lowStockCount}</Text>
          </View>
          <View style={tw`flex-1 bg-stone-100 rounded-lg p-3`}>
            <Text style={tw`text-xs text-stone-600 mb-1`}>Value</Text>
            <Text style={tw`text-xl font-bold text-stone-900`}>${totalValue.toFixed(0)}</Text>
          </View>
        </View>
        <View style={tw`flex-row gap-2`}>
          {(['all', 'low', 'out'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => dispatch(setCatalogFilter(f))}
              style={tw`px-4 py-2 rounded-full ${catalogFilter === f ? 'bg-emerald-600' : 'bg-stone-100'}`}
            >
              <Text style={tw`text-sm font-semibold ${catalogFilter === f ? 'text-white' : 'text-stone-600'}`}>
                {f === 'all' ? 'All' : f === 'low' ? 'Low' : 'Out'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        style={tw`flex-1 px-4 pt-4`}
        {...verticalScrollProps}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#059669" colors={['#059669']} />
        }
      >
        {loading ? (
          <Text style={tw`text-stone-500 text-center py-12`}>Loading catalog…</Text>
        ) : filteredProducts.length === 0 ? (
          <BusinessEmptyState
            icon="cube-outline"
            title={searchQuery ? 'No matches' : 'No products yet'}
            description={searchQuery ? 'Try a different search.' : 'Add your first product to start selling.'}
            actionLabel="Add product"
            onAction={() => {
              setEditingProduct(null);
              setShowProductForm(true);
            }}
          />
        ) : (
          filteredProducts.map((product) => {
            const sku = `PRD-${product.id.slice(-6).toUpperCase()}`;
            return (
              <View key={product.id} style={tw`bg-white rounded-2xl p-4 mb-3 border border-stone-100`}>
                <View style={tw`flex-row items-start`}>
                  {product.image_url ? (
                    <Image source={{ uri: product.image_url }} style={tw`w-16 h-16 rounded-lg mr-3`} contentFit="cover" />
                  ) : (
                    <View style={tw`w-16 h-16 rounded-lg mr-3 bg-stone-100 items-center justify-center`}>
                      <Ionicons name="image-outline" size={24} color="#A8A29E" />
                    </View>
                  )}
                  <View style={tw`flex-1`}>
                    <View style={tw`flex-row items-start justify-between`}>
                      <Text style={tw`text-lg font-bold text-stone-900 flex-1 pr-2`}>{product.name}</Text>
                      <StockBadge stock={product.stock} threshold={threshold} />
                    </View>
                    <Text style={tw`text-sm text-stone-500 mt-1`}>
                      {sku} · {categoryName(product.category)}
                      {product.units_sold != null ? ` · ${product.units_sold} sold` : ''}
                    </Text>
                    <Text style={tw`text-xl font-bold text-stone-900 mt-2`}>${product.price.toFixed(2)}</Text>
                  </View>
                </View>
                <View style={tw`flex-row gap-2 mt-3`}>
                  <TouchableOpacity
                    style={tw`flex-1 py-2.5 bg-emerald-600 rounded-xl items-center`}
                    onPress={() => {
                      setEditingProduct(product);
                      setShowProductForm(true);
                    }}
                  >
                    <Text style={tw`text-white font-semibold`}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={tw`px-4 py-2.5 bg-red-50 rounded-xl items-center justify-center`}
                    onPress={() => void handleDeleteProduct(product)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={tw`px-4 pb-4 pt-2 bg-white border-t border-stone-200`}>
        <TouchableOpacity
          style={tw`bg-emerald-600 rounded-xl py-4 flex-row items-center justify-center`}
          onPress={() => {
            setEditingProduct(null);
            setShowProductForm(true);
          }}
        >
          <Ionicons name="add-circle" size={22} color="#FFFFFF" style={tw`mr-2`} />
          <Text style={tw`text-white font-bold text-base`}>Add product</Text>
        </TouchableOpacity>
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
    </SafeAreaView>
  );
}
