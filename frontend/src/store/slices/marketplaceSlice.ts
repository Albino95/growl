import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { getProducts, getProduct } from '../../services/api/marketplace';

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url?: string;
  stock: number;
  business_id: string;
  created_at: string;
};

export type CartItem = {
  product_id: string;
  quantity: number;
  product?: Product; // Populated when fetching cart details
};

interface MarketplaceState {
  products: Product[];
  selectedProduct: Product | null;
  cart: CartItem[];
  isLoading: boolean;
  error: string | null;
  selectedCategory: string | null;
}

const initialState: MarketplaceState = {
  products: [],
  selectedProduct: null,
  cart: [],
  isLoading: false,
  error: null,
  selectedCategory: null,
};

// Async thunks
export const fetchProducts = createAsyncThunk(
  'marketplace/fetchProducts',
  async (category?: string) => {
    const products = await getProducts(category);
    return products;
  }
);

export const fetchProduct = createAsyncThunk(
  'marketplace/fetchProduct',
  async (productId: string) => {
    const product = await getProduct(productId);
    return product;
  }
);

const marketplaceSlice = createSlice({
  name: 'marketplace',
  initialState,
  reducers: {
    setSelectedCategory: (state, action: PayloadAction<string | null>) => {
      state.selectedCategory = action.payload;
    },
    addToCart: (state, action: PayloadAction<CartItem>) => {
      const existingItem = state.cart.find(
        (item) => item.product_id === action.payload.product_id
      );
      if (existingItem) {
        existingItem.quantity += action.payload.quantity;
      } else {
        state.cart.push(action.payload);
      }
    },
    removeFromCart: (state, action: PayloadAction<string>) => {
      state.cart = state.cart.filter((item) => item.product_id !== action.payload);
    },
    updateCartItemQuantity: (
      state,
      action: PayloadAction<{ product_id: string; quantity: number }>
    ) => {
      const item = state.cart.find((item) => item.product_id === action.payload.product_id);
      if (item) {
        if (action.payload.quantity <= 0) {
          state.cart = state.cart.filter((item) => item.product_id !== action.payload.product_id);
        } else {
          item.quantity = action.payload.quantity;
        }
      }
    },
    clearCart: (state) => {
      state.cart = [];
    },
    setSelectedProduct: (state, action: PayloadAction<Product | null>) => {
      state.selectedProduct = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch Products
    builder
      .addCase(fetchProducts.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.products = action.payload;
        state.isLoading = false;
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch products';
      });

    // Fetch Product
    builder
      .addCase(fetchProduct.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchProduct.fulfilled, (state, action) => {
        state.selectedProduct = action.payload;
        state.isLoading = false;
      })
      .addCase(fetchProduct.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch product';
      });
  },
});

export const {
  setSelectedCategory,
  addToCart,
  removeFromCart,
  updateCartItemQuantity,
  clearCart,
  setSelectedProduct,
  clearError,
} = marketplaceSlice.actions;

export default marketplaceSlice.reducer;
