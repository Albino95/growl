import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, RefreshControl, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import tw from '../../lib/tw';
import { verticalScrollProps } from '../../constants/scroll';
import { getBusinessProducts, createProduct, updateProduct, deleteProduct, type Product } from '../../services/api/marketplace';
import ProductForm from '../../components/business/ProductForm';
import CATEGORIES from '../../data/categories';
import { getCategoryImageUrl } from '../../utils/images';

type InventoryProduct = Product & {
  lowStock: boolean;
  sku: string;
};

export default function InventoryScreen() {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const response = await getBusinessProducts();
      if (response.success && response.data.products) {
        const inventoryProducts: InventoryProduct[] = response.data.products.map((p) => ({
          ...p,
          lowStock: p.stock < 10,
          sku: `PRD-${p.id.slice(-6).toUpperCase()}`,
        }));
        setProducts(inventoryProducts);
      }
    } catch (error: any) {
      console.error('[InventoryScreen] Error loading products:', error);
      if (Platform.OS === 'web') {
        alert(error.message || 'Failed to load products');
      } else {
        Alert.alert('Error', error.message || 'Failed to load products');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadProducts();
  };

  const handleCreateProduct = async (productData: any) => {
    try {
      await createProduct(productData);
      await loadProducts();
      if (Platform.OS === 'web') {
        alert('Product created successfully!');
      } else {
        Alert.alert('Success', 'Product created successfully!');
      }
    } catch (error: any) {
      throw error;
    }
  };

  const handleUpdateProduct = async (productData: any) => {
    if (!editingProduct) return;
    try {
      await updateProduct(editingProduct.id, productData);
      await loadProducts();
      setEditingProduct(null);
      if (Platform.OS === 'web') {
        alert('Product updated successfully!');
      } else {
        Alert.alert('Success', 'Product updated successfully!');
      }
    } catch (error: any) {
      throw error;
    }
  };

  const handleDeleteProduct = (product: InventoryProduct) => {
    Alert.alert(
      'Delete Product',
      `Are you sure you want to delete "${product.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProduct(product.id);
              await loadProducts();
              if (Platform.OS === 'web') {
                alert('Product deleted successfully!');
              } else {
                Alert.alert('Success', 'Product deleted successfully!');
              }
            } catch (error: any) {
              if (Platform.OS === 'web') {
                alert(error.message || 'Failed to delete product');
              } else {
                Alert.alert('Error', error.message || 'Failed to delete product');
              }
            }
          },
        },
      ]
    );
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'all' || 
                         (filter === 'low' && product.lowStock) ||
                         (filter === 'out' && product.stock === 0);
    return matchesSearch && matchesFilter;
  });

  const totalValue = products.reduce((sum, p) => sum + (p.stock * p.price), 0);
  const lowStockCount = products.filter(p => p.lowStock || p.stock === 0).length;
  const categoryName = (catId: string) => CATEGORIES.find(c => c.id === catId)?.name || catId;

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top']}>
      <View style={tw`bg-white px-4 pt-3 pb-3 border-b border-stone-100`}>
        <Text style={tw`text-2xl font-bold text-stone-900 mb-3 tracking-tight`}>Inventory</Text>
        
        {/* Search */}
        <View style={tw`relative mb-3`}>
          <Ionicons name="search" size={20} color="#9CA3AF" style={tw`absolute left-3 top-3 z-10`} />
          <TextInput
            placeholder="Search products by name or SKU..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={tw`bg-gray-100 rounded-lg pl-10 pr-4 py-2.5 text-base`}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Stats */}
        <View style={tw`flex-row gap-3`}>
          <View style={tw`flex-1 bg-blue-50 rounded-lg p-3`}>
            <Text style={tw`text-xs text-blue-600 mb-1`}>Total Products</Text>
            <Text style={tw`text-xl font-bold text-blue-900`}>{products.length}</Text>
          </View>
          <View style={tw`flex-1 bg-orange-50 rounded-lg p-3`}>
            <Text style={tw`text-xs text-orange-600 mb-1`}>Low Stock</Text>
            <Text style={tw`text-xl font-bold text-orange-900`}>{lowStockCount}</Text>
          </View>
          <View style={tw`flex-1 bg-green-50 rounded-lg p-3`}>
            <Text style={tw`text-xs text-green-600 mb-1`}>Total Value</Text>
            <Text style={tw`text-xl font-bold text-green-900`}>${totalValue.toFixed(0)}</Text>
          </View>
        </View>

        {/* Filters */}
        <View style={tw`flex-row gap-2 mt-3`}>
          {(['all', 'low', 'out'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={tw`px-4 py-2 rounded-full ${
                filter === f ? 'bg-emerald-600' : 'bg-stone-100'
              }`}
            >
              <Text style={tw`text-sm font-semibold ${
                filter === f ? 'text-white' : 'text-stone-600'
              }`}>
                {f === 'all' ? 'All' : f === 'low' ? 'Low Stock' : 'Out of Stock'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Products List */}
      <ScrollView
        style={tw`flex-1 px-4 pt-4`}
        {...verticalScrollProps}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#059669"
            colors={['#059669']}
          />
        }
      >
        {loading && products.length === 0 ? (
          <View style={tw`items-center justify-center py-12`}>
            <Text style={tw`text-gray-500`}>Loading products...</Text>
          </View>
        ) : filteredProducts.length === 0 ? (
          <View style={tw`items-center justify-center py-12`}>
            <Ionicons name="cube-outline" size={64} color="#9CA3AF" />
            <Text style={tw`text-gray-500 mt-4 text-center`}>
              {searchQuery ? 'No products found matching your search' : 'No products yet. Add your first product!'}
            </Text>
          </View>
        ) : (
          filteredProducts.map((product) => (
            <View
              key={product.id}
              style={tw`bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100`}
            >
              <View style={tw`flex-row items-start justify-between mb-2`}>
                <View style={tw`flex-row flex-1`}>
                  {product.image_url && (
                    <Image
                      source={{ uri: product.image_url }}
                      style={tw`w-16 h-16 rounded-lg mr-3`}
                      contentFit="cover"
                    />
                  )}
                  <View style={tw`flex-1`}>
                    <Text style={tw`text-lg font-bold text-gray-900 mb-1`}>{product.name}</Text>
                    <Text style={tw`text-sm text-gray-500`}>
                      SKU: {product.sku} • {categoryName(product.category)}
                    </Text>
                    {product.description && (
                      <Text style={tw`text-sm text-gray-400 mt-1`} numberOfLines={2}>
                        {product.description}
                      </Text>
                    )}
                  </View>
                </View>
                {(product.lowStock || product.stock === 0) && (
                  <View style={tw`px-2 py-1 rounded-full bg-red-100 ml-2`}>
                    <Text style={tw`text-xs font-semibold text-red-700`}>
                      {product.stock === 0 ? 'OUT' : 'LOW'}
                    </Text>
                  </View>
                )}
              </View>
              <View style={tw`flex-row items-center justify-between mt-3`}>
                <View>
                  <Text style={tw`text-sm text-gray-500`}>Stock</Text>
                  <Text style={tw`text-xl font-bold ${
                    product.stock === 0 ? 'text-red-600' : product.lowStock ? 'text-orange-600' : 'text-gray-900'
                  }`}>
                    {product.stock} units
                  </Text>
                </View>
                <View style={tw`items-end`}>
                  <Text style={tw`text-sm text-gray-500`}>Price</Text>
                  <Text style={tw`text-xl font-bold text-gray-900`}>${product.price.toFixed(2)}</Text>
                </View>
                <View style={tw`flex-row gap-2`}>
                  <TouchableOpacity
                    style={tw`px-4 py-2 bg-blue-600 rounded-lg`}
                    onPress={() => {
                      setEditingProduct(product);
                      setShowProductForm(true);
                    }}
                  >
                    <Text style={tw`text-white font-semibold text-sm`}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={tw`px-4 py-2 bg-red-600 rounded-lg`}
                    onPress={() => handleDeleteProduct(product)}
                  >
                    <Ionicons name="trash" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add Product Button */}
      <View style={tw`px-4 pb-4 pt-2 bg-white border-t border-gray-200`}>
        <TouchableOpacity
          style={tw`bg-blue-600 rounded-xl py-4 flex-row items-center justify-center`}
          onPress={() => {
            setEditingProduct(null);
            setShowProductForm(true);
          }}
        >
          <Ionicons name="add-circle" size={24} color="#FFFFFF" style={tw`mr-2`} />
          <Text style={tw`text-white font-bold text-base`}>Add New Product</Text>
        </TouchableOpacity>
      </View>

      {/* Product Form Modal */}
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
