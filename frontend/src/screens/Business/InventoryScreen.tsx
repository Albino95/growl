import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';

type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  price: number;
  lowStock: boolean;
  image?: string;
};

const MOCK_PRODUCTS: Product[] = [
  { id: '1', name: 'Premium Yoga Mat', sku: 'YM-001', category: 'Fitness', stock: 45, price: 34.99, lowStock: false },
  { id: '2', name: 'Protein Powder 2lb', sku: 'PP-002', category: 'Nutrition', stock: 8, price: 45.50, lowStock: true },
  { id: '3', name: 'Resistance Bands Set', sku: 'RB-003', category: 'Fitness', stock: 23, price: 29.99, lowStock: false },
  { id: '4', name: 'Meditation Cushion', sku: 'MC-004', category: 'Mindset', stock: 3, price: 39.99, lowStock: true },
  { id: '5', name: 'Fitness Tracker', sku: 'FT-005', category: 'Tech', stock: 67, price: 89.99, lowStock: false },
];

export default function InventoryScreen() {
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'all' || 
                         (filter === 'low' && product.lowStock) ||
                         (filter === 'out' && product.stock === 0);
    return matchesSearch && matchesFilter;
  });

  const totalValue = products.reduce((sum, p) => sum + (p.stock * p.price), 0);
  const lowStockCount = products.filter(p => p.lowStock || p.stock === 0).length;

  return (
    <SafeAreaView style={tw`flex-1 bg-gray-50`}>
      {/* Header */}
      <View style={tw`bg-white px-4 pt-4 pb-3 border-b border-gray-200`}>
        <Text style={tw`text-2xl font-bold text-gray-900 mb-3`}>Inventory Management</Text>
        
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
                filter === f ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <Text style={tw`text-sm font-semibold ${
                filter === f ? 'text-white' : 'text-gray-700'
              }`}>
                {f === 'all' ? 'All' : f === 'low' ? 'Low Stock' : 'Out of Stock'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Products List */}
      <ScrollView style={tw`flex-1 px-4 pt-4`}>
        {filteredProducts.map((product) => (
          <TouchableOpacity
            key={product.id}
            style={tw`bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100`}
          >
            <View style={tw`flex-row items-start justify-between mb-2`}>
              <View style={tw`flex-1`}>
                <Text style={tw`text-lg font-bold text-gray-900 mb-1`}>{product.name}</Text>
                <Text style={tw`text-sm text-gray-500`}>SKU: {product.sku} • {product.category}</Text>
              </View>
              {(product.lowStock || product.stock === 0) && (
                <View style={tw`px-2 py-1 rounded-full bg-red-100`}>
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
              <TouchableOpacity style={tw`px-4 py-2 bg-blue-600 rounded-lg`}>
                <Text style={tw`text-white font-semibold text-sm`}>Edit</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Add Product Button */}
      <View style={tw`px-4 pb-4 pt-2 bg-white border-t border-gray-200`}>
        <TouchableOpacity
          style={tw`bg-blue-600 rounded-xl py-4 flex-row items-center justify-center`}
        >
          <Ionicons name="add-circle" size={24} color="#FFFFFF" style={tw`mr-2`} />
          <Text style={tw`text-white font-bold text-base`}>Add New Product</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
