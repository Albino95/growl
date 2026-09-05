import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import tw from '../../lib/tw';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import {
  getProduct,
  createCheckoutSession,
  getPaymentConfig,
  OrderItem,
  ShippingAddress,
} from '../../services/api/marketplace';
import { getProductImageUrl } from '../../utils/images';
import type { Product } from '../../services/api/marketplace';
import LocationPickerSheet, {
  type LocationOption,
} from '../../components/marketplace/LocationPickerSheet';
import {
  getAllCountriesSorted,
  getStatesForCountry,
  getCitiesForStateAsync,
  getCitiesForCountryAsync,
  subdivisionLabel,
  postalLabel,
  type GeoCountry,
  type GeoCity,
} from '../../data/geoLocations';
import { alertMessage } from '../../utils/confirmDialog';

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

type FieldKey = 'name' | 'street' | 'country' | 'state' | 'city' | 'zip';

function fieldBorder(hasError: boolean) {
  return hasError
    ? 'bg-surface-page border border-red-400 rounded-2xl px-4 py-3'
    : 'bg-surface-page border border-stone-200/80 rounded-2xl px-4 py-3';
}

export default function CheckoutScreen() {
  const navigation = useNavigation<CheckoutNavigationProp>();
  const route = useRoute<CheckoutRouteProp>();
  const { items: initialItems } = route.params || { items: [] };
  const scrollRef = useRef<ScrollView>(null);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [geoReady, setGeoReady] = useState(false);

  const [shipping, setShipping] = useState<ShippingAddress>({
    name: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: '',
  });
  const [countryCode, setCountryCode] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [picker, setPicker] = useState<'country' | 'state' | 'city' | null>(null);
  const [cityManual, setCityManual] = useState(false);
  const [countries, setCountries] = useState<GeoCountry[]>([]);
  const [cities, setCities] = useState<GeoCity[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const states = useMemo(
    () => (countryCode ? getStatesForCountry(countryCode) : []),
    [countryCode]
  );

  const countryOptions: LocationOption[] = useMemo(
    () =>
      countries.map((c) => ({
        key: c.isoCode,
        label: `${c.flag} ${c.name}`,
        subtitle: c.isoCode,
      })),
    [countries]
  );

  const stateOptions: LocationOption[] = useMemo(
    () =>
      states.map((s) => ({
        key: s.isoCode,
        label: s.name,
        subtitle: s.isoCode,
      })),
    [states]
  );

  const cityOptions: LocationOption[] = useMemo(
    () =>
      cities.map((c) => ({
        key: `${c.stateCode}:${c.name}`,
        label: c.name,
        subtitle: c.stateCode || undefined,
      })),
    [cities]
  );

  const regionLabel = subdivisionLabel(countryCode);
  const zipLabel = postalLabel(countryCode);
  const needsState = states.length > 0;
  const canPickCity = cities.length > 0 && !cityManual;

  const clearFieldError = useCallback((key: FieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFormError(null);
  }, []);

  // Defer geo package load so the screen paints before country data parses.
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      try {
        const list = getAllCountriesSorted();
        if (!cancelled) {
          setCountries(list);
          setGeoReady(true);
        }
      } catch (e) {
        console.warn('[Checkout] geo init failed', e);
        if (!cancelled) {
          setGeoReady(true);
          setFormError('Location list failed to load. You can still type city and region.');
        }
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, []);

  useEffect(() => {
    void loadPaymentConfig();
    void loadCartItems();
  }, []);

  // Lazy-load cities only when country/state selection is ready.
  useEffect(() => {
    let cancelled = false;
    async function loadCities() {
      if (!countryCode) {
        setCities([]);
        return;
      }
      if (needsState && !stateCode) {
        setCities([]);
        return;
      }
      setCitiesLoading(true);
      try {
        const list =
          stateCode
            ? await getCitiesForStateAsync(countryCode, stateCode)
            : await getCitiesForCountryAsync(countryCode);
        if (!cancelled) setCities(list);
      } catch {
        if (!cancelled) setCities([]);
      } finally {
        if (!cancelled) setCitiesLoading(false);
      }
    }
    void loadCities();
    return () => {
      cancelled = true;
    };
  }, [countryCode, stateCode, needsState]);

  const selectCountry = (option: LocationOption) => {
    const next = countries.find((c) => c.isoCode === option.key);
    if (!next) return;
    setCountryCode(next.isoCode);
    setStateCode('');
    setCityManual(false);
    setCities([]);
    setShipping((prev) => ({
      ...prev,
      country: next.name,
      state: '',
      city: '',
    }));
    clearFieldError('country');
    clearFieldError('state');
    clearFieldError('city');
  };

  const selectState = (option: LocationOption) => {
    const next = states.find((s) => s.isoCode === option.key);
    if (!next) return;
    setStateCode(next.isoCode);
    setCityManual(false);
    setShipping((prev) => ({
      ...prev,
      state: next.name,
      city: '',
    }));
    clearFieldError('state');
    clearFieldError('city');
  };

  const selectCity = (option: LocationOption) => {
    setCityManual(false);
    setShipping((prev) => ({
      ...prev,
      city: option.label,
    }));
    clearFieldError('city');
  };

  const loadPaymentConfig = async () => {
    try {
      const response = await getPaymentConfig();
      setPaymentsEnabled(response.success && response.data?.enabled === true);
    } catch {
      setPaymentsEnabled(false);
    } finally {
      setConfigLoaded(true);
    }
  };

  const loadCartItems = async () => {
    try {
      setLoading(true);
      const items = Array.isArray(initialItems) ? initialItems : [];
      const itemsWithProducts = await Promise.all(
        items.map(async (item) => {
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
    } catch {
      alertMessage('Error', 'Failed to load cart items');
    } finally {
      setLoading(false);
    }
  };

  const calculateSubtotal = () =>
    cartItems.reduce((sum, item) => sum + (item.product?.price || 0) * item.quantity, 0);

  const calculateShipping = () => (calculateSubtotal() >= 50 ? 0 : 5.99);

  const calculateTotal = () => calculateSubtotal() + calculateShipping();

  const validateForm = (): boolean => {
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!shipping.name.trim()) errors.name = 'Enter your full name';
    if (!shipping.street.trim()) errors.street = 'Enter your street address';
    if (!shipping.country.trim() || !countryCode) errors.country = 'Select your country';
    if (needsState && !shipping.state.trim()) {
      errors.state = `Select your ${regionLabel.toLowerCase()}`;
    }
    if (!shipping.city.trim()) errors.city = 'Select or enter your city';
    if (!shipping.zip.trim()) errors.zip = `Enter your ${zipLabel.toLowerCase()}`;

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      const first = Object.values(errors)[0];
      setFormError(first || 'Please complete the required shipping fields.');
      alertMessage('Missing shipping info', first);
      scrollRef.current?.scrollTo({ y: 180, animated: true });
      return false;
    }

    if (cartItems.length === 0) {
      setFormError('Your cart is empty');
      alertMessage('Validation Error', 'Your cart is empty');
      return false;
    }

    setFormError(null);
    return true;
  };

  const shippingPayload = (): ShippingAddress => ({
    ...shipping,
    state: shipping.state.trim() || 'N/A',
  });

  const handlePlaceOrder = async () => {
    if (!paymentsEnabled) {
      alertMessage('Checkout unavailable', 'Payments are not enabled yet.');
      return;
    }
    if (!validateForm()) return;

    for (const item of cartItems) {
      if (!item.product) {
        alertMessage('Error', 'Some products could not be loaded');
        return;
      }
      if (item.product.stock < item.quantity) {
        alertMessage(
          'Out of Stock',
          `${item.product.name} only has ${item.product.stock} items in stock`
        );
        return;
      }
    }

    try {
      setProcessing(true);
      const response = await createCheckoutSession({
        items: cartItems.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        })),
        shipping_address: shippingPayload(),
      });

      if (response.success && response.data?.url) {
        const canOpen = await Linking.canOpenURL(response.data.url);
        if (canOpen) {
          await Linking.openURL(response.data.url);
          alertMessage(
            'Complete payment',
            'Finish checkout in the browser. After payment you will land on the success page; return to the app to see your order.'
          );
        } else {
          alertMessage(
            'Checkout Ready',
            'Complete your payment in the browser to finish your order.'
          );
        }
      } else {
        alertMessage('Error', 'Failed to start checkout. Please try again.');
      }
    } catch (error: unknown) {
      alertMessage(
        'Error',
        error instanceof Error ? error.message : 'Failed to start checkout. Please try again.'
      );
    } finally {
      setProcessing(false);
    }
  };

  if (loading || !configLoaded) {
    return (
      <SafeAreaView style={tw`flex-1 bg-surface-page`}>
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={tw`mt-4 text-stone-600`}>Loading checkout...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const subtotal = calculateSubtotal();
  const shippingCost = calculateShipping();
  const total = calculateTotal();

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`}>
      <View style={tw`flex-row items-center justify-between px-4 py-3 bg-surface-card border-b border-stone-200/80`}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1C1917" />
        </TouchableOpacity>
        <Text style={tw`text-lg font-semibold text-stone-900`}>Checkout</Text>
        <View style={tw`w-6`} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={tw`flex-1`}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={tw`pb-4`}
      >
        {!paymentsEnabled && (
          <View style={tw`mx-4 mt-4 mb-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex-row items-center`}>
            <Ionicons name="time-outline" size={20} color="#D97706" style={tw`mr-2`} />
            <Text style={tw`text-amber-800 text-sm font-medium flex-1`}>
              Checkout opening soon — payments are not enabled yet.
            </Text>
          </View>
        )}

        {formError ? (
          <View style={tw`mx-4 mt-4 mb-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex-row items-start`}>
            <Ionicons name="alert-circle" size={20} color="#DC2626" style={tw`mr-2 mt-0.5`} />
            <Text style={tw`text-red-700 text-sm font-medium flex-1`}>{formError}</Text>
          </View>
        ) : null}

        <View style={tw`mx-4 mt-4 mb-4 bg-surface-card border border-stone-200/80 rounded-2xl overflow-hidden`}>
          <View style={tw`px-4 py-3 border-b border-stone-200/80`}>
            <Text style={tw`text-lg font-semibold text-stone-900`}>Order Items</Text>
          </View>
          {cartItems.map((item, index) => {
            const productImage =
              item.product?.image_url ||
              item.product?.images?.[0] ||
              (item.product ? getProductImageUrl(item.product.category, item.product.id) : '');
            const isLast = index === cartItems.length - 1;
            return (
              <View
                key={index}
                style={tw`px-4 py-4 flex-row ${isLast ? '' : 'border-b border-stone-200/60'}`}
              >
                {item.product && (
                  <>
                    {productImage ? (
                      <Image
                        source={{ uri: productImage }}
                        style={tw`w-16 h-16 rounded-2xl mr-4 bg-surface-subtle`}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={tw`w-16 h-16 bg-surface-subtle border border-stone-200/60 rounded-2xl mr-4 items-center justify-center`}>
                        <Ionicons name="image-outline" size={24} color="#A8A29E" />
                      </View>
                    )}
                    <View style={tw`flex-1`}>
                      <Text style={tw`text-base font-semibold text-stone-900 mb-1`}>
                        {item.product.name}
                      </Text>
                      <Text style={tw`text-sm text-stone-600 mb-2`}>
                        Quantity: {item.quantity}
                      </Text>
                      <Text style={tw`text-base font-bold text-brand-600`}>
                        ${(item.product.price * item.quantity).toFixed(2)}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            );
          })}
        </View>

        <View style={tw`mx-4 mb-4 bg-surface-card border border-stone-200/80 rounded-2xl overflow-hidden`}>
          <View style={tw`px-4 py-3 border-b border-stone-200/80`}>
            <Text style={tw`text-lg font-semibold text-stone-900`}>Shipping Address</Text>
          </View>
          <View style={tw`px-4 py-4`}>
            <TextInput
              placeholder="Full Name"
              value={shipping.name}
              onChangeText={(text) => {
                setShipping({ ...shipping, name: text });
                clearFieldError('name');
              }}
              style={tw`${fieldBorder(!!fieldErrors.name)} mb-1`}
            />
            {fieldErrors.name ? (
              <Text style={tw`text-red-600 text-xs mb-2`}>{fieldErrors.name}</Text>
            ) : (
              <View style={tw`mb-2`} />
            )}

            <TextInput
              placeholder="Street Address"
              value={shipping.street}
              onChangeText={(text) => {
                setShipping({ ...shipping, street: text });
                clearFieldError('street');
              }}
              style={tw`${fieldBorder(!!fieldErrors.street)} mb-1`}
            />
            {fieldErrors.street ? (
              <Text style={tw`text-red-600 text-xs mb-2`}>{fieldErrors.street}</Text>
            ) : (
              <View style={tw`mb-2`} />
            )}

            <Text style={tw`text-xs font-semibold text-stone-500 mb-1.5 uppercase tracking-wide`}>
              Country
            </Text>
            <TouchableOpacity
              onPress={() => setPicker('country')}
              disabled={!geoReady}
              style={tw`${fieldBorder(!!fieldErrors.country)} mb-1 flex-row items-center justify-between ${
                !geoReady ? 'opacity-60' : ''
              }`}
            >
              <Text style={tw`text-[15px] ${shipping.country ? 'text-stone-900' : 'text-stone-400'}`}>
                {!geoReady
                  ? 'Loading countries…'
                  : shipping.country
                    ? `${countries.find((c) => c.isoCode === countryCode)?.flag || ''} ${shipping.country}`.trim()
                    : 'Select country'}
              </Text>
              {geoReady ? (
                <Ionicons name="chevron-down" size={18} color="#78716C" />
              ) : (
                <ActivityIndicator size="small" color="#059669" />
              )}
            </TouchableOpacity>
            {fieldErrors.country ? (
              <Text style={tw`text-red-600 text-xs mb-2`}>{fieldErrors.country}</Text>
            ) : (
              <View style={tw`mb-2`} />
            )}

            {needsState ? (
              <>
                <Text style={tw`text-xs font-semibold text-stone-500 mb-1.5 uppercase tracking-wide`}>
                  {regionLabel}
                </Text>
                <TouchableOpacity
                  onPress={() => setPicker('state')}
                  disabled={!countryCode}
                  style={tw`${fieldBorder(!!fieldErrors.state)} mb-1 flex-row items-center justify-between ${
                    !countryCode ? 'opacity-50' : ''
                  }`}
                >
                  <Text style={tw`text-[15px] ${shipping.state ? 'text-stone-900' : 'text-stone-400'}`}>
                    {shipping.state || `Select ${regionLabel.toLowerCase()}`}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#78716C" />
                </TouchableOpacity>
                {fieldErrors.state ? (
                  <Text style={tw`text-red-600 text-xs mb-2`}>{fieldErrors.state}</Text>
                ) : (
                  <View style={tw`mb-2`} />
                )}
              </>
            ) : countryCode ? (
              <>
                <Text style={tw`text-xs font-semibold text-stone-500 mb-1.5 uppercase tracking-wide`}>
                  {regionLabel} (optional)
                </Text>
                <TextInput
                  placeholder="District / area (optional)"
                  value={shipping.state === 'N/A' ? '' : shipping.state}
                  onChangeText={(text) => setShipping({ ...shipping, state: text })}
                  style={tw`${fieldBorder(false)} mb-3`}
                />
              </>
            ) : null}

            <Text style={tw`text-xs font-semibold text-stone-500 mb-1.5 uppercase tracking-wide`}>
              City
            </Text>
            {citiesLoading ? (
              <View style={tw`${fieldBorder(false)} mb-3 flex-row items-center`}>
                <ActivityIndicator size="small" color="#059669" />
                <Text style={tw`ml-2 text-stone-500`}>Loading cities…</Text>
              </View>
            ) : canPickCity ? (
              <>
                <TouchableOpacity
                  onPress={() => setPicker('city')}
                  disabled={needsState && !stateCode}
                  style={tw`${fieldBorder(!!fieldErrors.city)} mb-1 flex-row items-center justify-between ${
                    needsState && !stateCode ? 'opacity-50' : ''
                  }`}
                >
                  <Text style={tw`text-[15px] ${shipping.city ? 'text-stone-900' : 'text-stone-400'}`}>
                    {shipping.city || 'Select city'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#78716C" />
                </TouchableOpacity>
                {fieldErrors.city ? (
                  <Text style={tw`text-red-600 text-xs mb-1`}>{fieldErrors.city}</Text>
                ) : null}
                <TouchableOpacity
                  onPress={() => {
                    setCityManual(true);
                    setShipping((prev) => ({ ...prev, city: '' }));
                  }}
                  style={tw`mb-3 mt-1`}
                >
                  <Text style={tw`text-sm text-brand-700 font-medium`}>City not listed? Enter it</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TextInput
                  placeholder="City / Town"
                  value={shipping.city}
                  onChangeText={(text) => {
                    setShipping({ ...shipping, city: text });
                    clearFieldError('city');
                  }}
                  style={tw`${fieldBorder(!!fieldErrors.city)} mb-1`}
                />
                {fieldErrors.city ? (
                  <Text style={tw`text-red-600 text-xs mb-1`}>{fieldErrors.city}</Text>
                ) : null}
                {cities.length > 0 ? (
                  <TouchableOpacity
                    onPress={() => {
                      setCityManual(false);
                      setShipping((prev) => ({ ...prev, city: '' }));
                    }}
                    style={tw`mb-3 mt-1`}
                  >
                    <Text style={tw`text-sm text-brand-700 font-medium`}>Pick from city list</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={tw`mb-3`} />
                )}
              </>
            )}

            <Text style={tw`text-xs font-semibold text-stone-500 mb-1.5 uppercase tracking-wide`}>
              {zipLabel}
            </Text>
            <TextInput
              placeholder={zipLabel}
              value={shipping.zip}
              onChangeText={(text) => {
                setShipping({ ...shipping, zip: text });
                clearFieldError('zip');
              }}
              autoCapitalize="characters"
              style={tw`${fieldBorder(!!fieldErrors.zip)}`}
            />
            {fieldErrors.zip ? (
              <Text style={tw`text-red-600 text-xs mt-1`}>{fieldErrors.zip}</Text>
            ) : null}
          </View>
        </View>

        <View style={tw`mx-4 mb-4 bg-surface-card border border-stone-200/80 rounded-2xl overflow-hidden`}>
          <View style={tw`px-4 py-3 border-b border-stone-200/80`}>
            <Text style={tw`text-lg font-semibold text-stone-900`}>Order Summary</Text>
          </View>
          <View style={tw`px-4 py-4`}>
            <View style={tw`flex-row justify-between mb-2`}>
              <Text style={tw`text-stone-600`}>Subtotal</Text>
              <Text style={tw`text-stone-900 font-medium`}>${subtotal.toFixed(2)}</Text>
            </View>
            <View style={tw`flex-row justify-between mb-2`}>
              <Text style={tw`text-stone-600`}>Shipping</Text>
              <Text style={tw`text-stone-900 font-medium`}>
                {shippingCost === 0 ? 'Free' : `$${shippingCost.toFixed(2)}`}
              </Text>
            </View>
            {shippingCost === 0 && (
              <Text style={tw`text-sm text-brand-600 mb-2`}>
                Free shipping on orders over $50!
              </Text>
            )}
            <View style={tw`border-t border-stone-200/80 pt-3 mt-2`}>
              <View style={tw`flex-row justify-between`}>
                <Text style={tw`text-lg font-bold text-stone-900`}>Total</Text>
                <Text style={tw`text-lg font-bold text-brand-600`}>${total.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={tw`bg-surface-card border-t border-stone-200/80 px-4 py-4`}>
        <TouchableOpacity
          onPress={() => void handlePlaceOrder()}
          disabled={processing || cartItems.length === 0 || !paymentsEnabled}
          style={tw`bg-brand-600 rounded-2xl py-4 items-center ${
            processing || cartItems.length === 0 || !paymentsEnabled ? 'opacity-50' : ''
          }`}
        >
          {processing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={tw`text-white font-bold text-lg`}>
              {paymentsEnabled ? 'Proceed to Payment' : 'Checkout Unavailable'}
            </Text>
          )}
        </TouchableOpacity>
        <Text style={tw`text-xs text-stone-500 text-center mt-2`}>
          By placing this order, you agree to our{' '}
          <Text
            style={tw`text-brand-700 underline`}
            onPress={() => navigateFromRoot(navigation, 'LegalDocument', { documentId: 'terms' })}
          >
            Terms of Service
          </Text>{' '}
          and{' '}
          <Text
            style={tw`text-brand-700 underline`}
            onPress={() => navigateFromRoot(navigation, 'LegalDocument', { documentId: 'privacy' })}
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </View>

      <LocationPickerSheet
        visible={picker === 'country'}
        title="Select country"
        placeholder="Search countries…"
        options={countryOptions}
        selectedKey={countryCode}
        onClose={() => setPicker(null)}
        onSelect={selectCountry}
      />
      <LocationPickerSheet
        visible={picker === 'state'}
        title={`Select ${regionLabel.toLowerCase()}`}
        placeholder={`Search ${regionLabel.toLowerCase()}…`}
        options={stateOptions}
        selectedKey={stateCode}
        emptyMessage="No regions found for this country."
        onClose={() => setPicker(null)}
        onSelect={selectState}
      />
      <LocationPickerSheet
        visible={picker === 'city'}
        title="Select city"
        placeholder="Search cities…"
        options={cityOptions}
        selectedKey={shipping.city ? `${stateCode}:${shipping.city}` : undefined}
        emptyMessage="No cities found. You can enter your city manually."
        onClose={() => setPicker(null)}
        onSelect={selectCity}
      />
    </SafeAreaView>
  );
}
