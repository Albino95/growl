import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import tw from '../../lib/tw';
import { getProduct, Product } from '../../services/api/marketplace';
import { getProductImageUrl, getProductImages } from '../../utils/images';

const { width } = Dimensions.get('window');

type ProductDetailRouteParams = {
  ProductDetail: {
    productId: string;
  };
};

type ProductDetailRouteProp = RouteProp<ProductDetailRouteParams, 'ProductDetail'>;

export default function ProductDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<ProductDetailRouteProp>();
  const { productId } = route.params;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    loadProduct();
  }, [productId]);

  const loadProduct = async () => {
    try {
      setLoading(true);
      const response = await getProduct(productId);
      if (response.success && response.data) {
        setProduct(response.data);
      } else {
        Alert.alert('Error', 'Failed to load product');
        navigation.goBack();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load product');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = () => {
    if (!product) return;
    
    if (product.stock < quantity) {
      Alert.alert('Out of Stock', 'Not enough items in stock');
      return;
    }

    // Navigate to checkout with product
    navigation.navigate('Checkout', {
      items: [
        {
          product_id: product.id,
          quantity,
        },
      ],
    });
  };

  const handleBuyNow = () => {
    handleAddToCart();
  };

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 bg-white`}>
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={tw`mt-4 text-gray-600`}>Loading product...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={tw`flex-1 bg-white`}>
        <View style={tw`flex-1 items-center justify-center px-6`}>
          <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
          <Text style={tw`mt-4 text-lg font-semibold text-gray-900`}>Product not found</Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={tw`mt-6 px-6 py-3 bg-green-600 rounded-lg`}
          >
            <Text style={tw`text-white font-semibold`}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const productImages = product.images && product.images.length > 0
    ? product.images
    : product.image_url
    ? [product.image_url]
    : getProductImages(product.category, product.id, 3);

  const mainImage = productImages[selectedImageIndex] || getProductImageUrl(product.category, product.id);

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <ScrollView style={tw`flex-1`} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={tw`flex-row items-center justify-between px-4 py-3 border-b border-gray-200`}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={tw`text-lg font-semibold text-gray-900`}>Product Details</Text>
          <TouchableOpacity>
            <Ionicons name="heart-outline" size={24} color="#111827" />
          </TouchableOpacity>
        </View>

        {/* Product Images */}
        <View style={tw`bg-gray-50`}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / width);
              setSelectedImageIndex(index);
            }}
            style={tw`h-96`}
          >
            {productImages.map((image: string, index: number) => (
              <Image
                key={index}
                source={{ uri: image }}
                style={tw`w-full h-full`}
                contentFit="cover"
              />
            ))}
          </ScrollView>

          {/* Image Indicators */}
          {productImages.length > 1 && (
            <View style={tw`flex-row justify-center py-2`}>
              {productImages.map((_: string, index: number) => (
                <View
                  key={index}
                  style={tw`w-2 h-2 rounded-full mx-1 ${
                    index === selectedImageIndex ? 'bg-green-600' : 'bg-gray-300'
                  }`}
                />
              ))}
            </View>
          )}
        </View>

        {/* Product Info */}
        <View style={tw`px-4 py-6`}>
          {/* Business Info */}
          {product.business && (
            <View style={tw`flex-row items-center mb-4`}>
              {product.business.avatar && (
                <Image
                  source={{ uri: product.business.avatar }}
                  style={tw`w-8 h-8 rounded-full mr-2`}
                />
              )}
              <Text style={tw`text-sm text-gray-600`}>
                Sold by {product.business.username || 'Business'}
              </Text>
            </View>
          )}

          {/* Product Name */}
          <Text style={tw`text-2xl font-bold text-gray-900 mb-2`}>{product.name}</Text>

          {/* Price */}
          <View style={tw`flex-row items-center mb-4`}>
            <Text style={tw`text-3xl font-bold text-green-600`}>${product.price.toFixed(2)}</Text>
            {product.stock > 0 && (
              <View style={tw`ml-4 px-3 py-1 bg-green-100 rounded-full`}>
                <Text style={tw`text-sm font-medium text-green-700`}>In Stock</Text>
              </View>
            )}
            {product.stock === 0 && (
              <View style={tw`ml-4 px-3 py-1 bg-red-100 rounded-full`}>
                <Text style={tw`text-sm font-medium text-red-700`}>Out of Stock</Text>
              </View>
            )}
          </View>

          {/* Description */}
          {product.description && (
            <View style={tw`mb-6`}>
              <Text style={tw`text-lg font-semibold text-gray-900 mb-2`}>Description</Text>
              <Text style={tw`text-gray-600 leading-6`}>{product.description}</Text>
            </View>
          )}

          {/* Category Tags */}
          <View style={tw`flex-row flex-wrap mb-6`}>
            {product.category && (
              <View style={tw`px-3 py-1 bg-gray-100 rounded-full mr-2 mb-2`}>
                <Text style={tw`text-sm text-gray-700`}>
                  {product.category.charAt(0).toUpperCase() + product.category.slice(1)}
                </Text>
              </View>
            )}
            {product.subcategory && (
              <View style={tw`px-3 py-1 bg-gray-100 rounded-full mr-2 mb-2`}>
                <Text style={tw`text-sm text-gray-700`}>
                  {product.subcategory.charAt(0).toUpperCase() + product.subcategory.slice(1)}
                </Text>
              </View>
            )}
          </View>

          {/* Quantity Selector */}
          <View style={tw`mb-6`}>
            <Text style={tw`text-lg font-semibold text-gray-900 mb-3`}>Quantity</Text>
            <View style={tw`flex-row items-center`}>
              <TouchableOpacity
                onPress={() => setQuantity(Math.max(1, quantity - 1))}
                style={tw`w-10 h-10 items-center justify-center border border-gray-300 rounded-lg`}
              >
                <Ionicons name="remove" size={20} color="#6B7280" />
              </TouchableOpacity>
              <Text style={tw`mx-6 text-lg font-semibold text-gray-900`}>{quantity}</Text>
              <TouchableOpacity
                onPress={() => setQuantity(Math.min(product.stock, quantity + 1))}
                disabled={quantity >= product.stock}
                style={tw`w-10 h-10 items-center justify-center border border-gray-300 rounded-lg ${
                  quantity >= product.stock ? 'opacity-50' : ''
                }`}
              >
                <Ionicons name="add" size={20} color="#6B7280" />
              </TouchableOpacity>
              <Text style={tw`ml-4 text-sm text-gray-600`}>
                {product.stock} available
              </Text>
            </View>
          </View>

          {/* Shipping Info */}
          <View style={tw`bg-gray-50 rounded-lg p-4 mb-6`}>
            <View style={tw`flex-row items-center mb-2`}>
              <Ionicons name="car-outline" size={20} color="#10B981" />
              <Text style={tw`ml-2 font-semibold text-gray-900`}>Shipping</Text>
            </View>
            <Text style={tw`text-sm text-gray-600`}>
              Free shipping on orders over $50. Estimated delivery: 3-5 business days.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={tw`border-t border-gray-200 bg-white px-4 py-3`}>
        <View style={tw`flex-row`}>
          <TouchableOpacity
            onPress={handleAddToCart}
            disabled={product.stock === 0}
            style={tw`flex-1 mr-2 px-4 py-3 bg-gray-100 rounded-lg items-center ${
              product.stock === 0 ? 'opacity-50' : ''
            }`}
          >
            <Text style={tw`font-semibold text-gray-900`}>Add to Cart</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleBuyNow}
            disabled={product.stock === 0}
            style={tw`flex-1 ml-2 px-4 py-3 bg-green-600 rounded-lg items-center ${
              product.stock === 0 ? 'opacity-50' : ''
            }`}
          >
            <Text style={tw`font-semibold text-white`}>Buy Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
