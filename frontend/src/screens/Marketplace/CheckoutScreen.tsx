import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import tw from '../../lib/tw';
import { getProduct, createOrder, OrderItem, ShippingAddress } from '../../services/api/marketplace';
import { getProductImageUrl } from '../../utils/images';
import type { Product } from '../../services/api/marketplace';

type CheckoutRouteParams = {
  Checkout: {
    items: OrderItem[];
  };
};

type CheckoutNavigationProp = StackNavigationProp<any>;
type CheckoutRouteProp = RouteProp<CheckoutRouteParams, 'Checkout'>;

interface CartItem extends OrderItem {
  product?: Product;
}

export default function CheckoutScreen() {
  const navigation = useNavigation<CheckoutNavigationProp>();
  const route = useRoute<CheckoutRouteProp>();
  const { items: initialItems } = route.params;

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Shipping form
  const [shipping, setShipping] = useState<ShippingAddress>({
    name: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: 'United States',
  });

  useEffect(() => {
    loadCartItems();
  }, []);

  const loadCartItems = async () => {
    try {
      setLoading(true);
      const itemsWithProducts = await Promise.all(
        initialItems.map(async (item) => {
          try {
            const response = await getProduct(item.product_id);
            return {
              ...item,
              product: response.success ? response.data : undefined,
            };
          } catch {
            return { ...item, product: undefined };
          }
        })
      );
      setCartItems(itemsWithProducts);
    } catch (error) {
      Alert.alert('Error', 'Failed to load cart items');
    } finally {
      setLoading(false);
    }
  };

  const calculateSubtotal = () => {
    return cartItems.reduce((sum, item) => {
      const price = item.product?.price || 0;
      return sum + price * item.quantity;
    }, 0);
  };

  const calculateShipping = () => {
    const subtotal = calculateSubtotal();
    return subtotal >= 50 ? 0 : 5.99; // Free shipping over $50
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateShipping();
  };

  const validateForm = (): boolean => {
    if (!shipping.name.trim()) {
      Alert.alert('Validation Error', 'Please enter your full name');
      return false;
    }
    if (!shipping.street.trim()) {
      Alert.alert('Validation Error', 'Please enter your street address');
      return false;
    }
    if (!shipping.city.trim()) {
      Alert.alert('Validation Error', 'Please enter your city');
      return false;
    }
    if (!shipping.state.trim()) {
      Alert.alert('Validation Error', 'Please enter your state');
      return false;
    }
    if (!shipping.zip.trim()) {
      Alert.alert('Validation Error', 'Please enter your ZIP code');
      return false;
    }
    if (cartItems.length === 0) {
      Alert.alert('Validation Error', 'Your cart is empty');
      return false;
    }
    return true;
  };

  const handlePlaceOrder = async () => {
    if (!validateForm()) return;

    // Check stock availability
    for (const item of cartItems) {
      if (!item.product) {
        Alert.alert('Error', 'Some products could not be loaded');
        return;
      }
      if (item.product.stock < item.quantity) {
        Alert.alert(
          'Out of Stock',
          `${item.product.name} only has ${item.product.stock} items in stock`
        );
        return;
      }
    }

    try {
      setProcessing(true);
      const response = await createOrder({
        items: cartItems.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        })),
        shipping_address: shipping,
      });

      if (response.success) {
        Alert.alert(
          'Order Placed!',
          `Your order #${response.data.id.slice(0, 8)} has been placed successfully.`,
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.navigate('Individual');
                navigation.navigate('Marketplace');
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to place order. Please try again.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to place order. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 bg-white`}>
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={tw`mt-4 text-gray-600`}>Loading checkout...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const subtotal = calculateSubtotal();
  const shippingCost = calculateShipping();
  const total = calculateTotal();

  return (
    <SafeAreaView style={tw`flex-1 bg-gray-50`}>
      {/* Header */}
      <View style={tw`flex-row items-center justify-between px-4 py-3 bg-white border-b border-gray-200`}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={tw`text-lg font-semibold text-gray-900`}>Checkout</Text>
        <View style={tw`w-6`} />
      </View>

      <ScrollView style={tw`flex-1`} showsVerticalScrollIndicator={false}>
        {/* Order Items */}
        <View style={tw`bg-white mb-4`}>
          <View style={tw`px-4 py-3 border-b border-gray-200`}>
            <Text style={tw`text-lg font-semibold text-gray-900`}>Order Items</Text>
          </View>
          {cartItems.map((item, index) => {
            const productImage =
              item.product?.image_url ||
              item.product?.images?.[0] ||
              (item.product
                ? getProductImageUrl(item.product.category, item.product.id)
                : '');
            return (
              <View
                key={index}
                style={tw`px-4 py-4 border-b border-gray-100 flex-row`}
              >
                {item.product && (
                  <>
                    {productImage ? (
                      <Image
                        source={{ uri: productImage }}
                        style={tw`w-16 h-16 rounded-lg mr-4`}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={tw`w-16 h-16 bg-gray-200 rounded-lg mr-4 items-center justify-center`}>
                        <Ionicons name="image-outline" size={24} color="#9CA3AF" />
                      </View>
                    )}
                    <View style={tw`flex-1`}>
                      <Text style={tw`text-base font-semibold text-gray-900 mb-1`}>
                        {item.product.name}
                      </Text>
                      <Text style={tw`text-sm text-gray-600 mb-2`}>
                        Quantity: {item.quantity}
                      </Text>
                      <Text style={tw`text-base font-bold text-green-600`}>
                        ${(item.product.price * item.quantity).toFixed(2)}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            );
          })}
        </View>

        {/* Shipping Address */}
        <View style={tw`bg-white mb-4`}>
          <View style={tw`px-4 py-3 border-b border-gray-200`}>
            <Text style={tw`text-lg font-semibold text-gray-900`}>Shipping Address</Text>
          </View>
          <View style={tw`px-4 py-4`}>
            <TextInput
              placeholder="Full Name"
              value={shipping.name}
              onChangeText={(text) => setShipping({ ...shipping, name: text })}
              style={tw`bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 mb-3`}
            />
            <TextInput
              placeholder="Street Address"
              value={shipping.street}
              onChangeText={(text) => setShipping({ ...shipping, street: text })}
              style={tw`bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 mb-3`}
            />
            <View style={tw`flex-row`}>
              <TextInput
                placeholder="City"
                value={shipping.city}
                onChangeText={(text) => setShipping({ ...shipping, city: text })}
                style={tw`flex-1 bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 mr-2`}
              />
              <TextInput
                placeholder="State"
                value={shipping.state}
                onChangeText={(text) => setShipping({ ...shipping, state: text })}
                style={tw`flex-1 bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 ml-2`}
              />
            </View>
            <TextInput
              placeholder="ZIP Code"
              value={shipping.zip}
              onChangeText={(text) => setShipping({ ...shipping, zip: text })}
              keyboardType="numeric"
              style={tw`bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 mt-3 mb-3`}
            />
            <TextInput
              placeholder="Country"
              value={shipping.country}
              onChangeText={(text) => setShipping({ ...shipping, country: text })}
              style={tw`bg-gray-50 border border-gray-300 rounded-lg px-4 py-3`}
            />
          </View>
        </View>

        {/* Order Summary */}
        <View style={tw`bg-white mb-4`}>
          <View style={tw`px-4 py-3 border-b border-gray-200`}>
            <Text style={tw`text-lg font-semibold text-gray-900`}>Order Summary</Text>
          </View>
          <View style={tw`px-4 py-4`}>
            <View style={tw`flex-row justify-between mb-2`}>
              <Text style={tw`text-gray-600`}>Subtotal</Text>
              <Text style={tw`text-gray-900 font-medium`}>${subtotal.toFixed(2)}</Text>
            </View>
            <View style={tw`flex-row justify-between mb-2`}>
              <Text style={tw`text-gray-600`}>Shipping</Text>
              <Text style={tw`text-gray-900 font-medium`}>
                {shippingCost === 0 ? 'Free' : `$${shippingCost.toFixed(2)}`}
              </Text>
            </View>
            {shippingCost === 0 && (
              <Text style={tw`text-sm text-green-600 mb-2`}>
                🎉 Free shipping on orders over $50!
              </Text>
            )}
            <View style={tw`border-t border-gray-200 pt-3 mt-2`}>
              <View style={tw`flex-row justify-between`}>
                <Text style={tw`text-lg font-bold text-gray-900`}>Total</Text>
                <Text style={tw`text-lg font-bold text-green-600`}>${total.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Place Order Button */}
      <View style={tw`bg-white border-t border-gray-200 px-4 py-4`}>
        <TouchableOpacity
          onPress={handlePlaceOrder}
          disabled={processing || cartItems.length === 0}
          style={tw`bg-green-600 rounded-lg py-4 items-center ${
            processing || cartItems.length === 0 ? 'opacity-50' : ''
          }`}
        >
          {processing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={tw`text-white font-bold text-lg`}>Place Order</Text>
          )}
        </TouchableOpacity>
        <Text style={tw`text-xs text-gray-500 text-center mt-2`}>
          By placing this order, you agree to our terms and conditions
        </Text>
      </View>
    </SafeAreaView>
  );
}
