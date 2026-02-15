# Redux Implementation Guide

## Overview

Redux has been fully implemented in the application. The app now uses Redux Toolkit for state management, replacing Zustand for most global state.

## Redux Store Structure

The Redux store is organized into the following slices:

### 1. **authSlice** (`src/store/slices/authSlice.ts`)
- Manages authentication state (user, token, hydration)
- Async thunks: `hydrateAuth`, `signIn`, `signInWithSSO`, `signOut`
- Actions: `updateUser`, `setOnboardingComplete`, `clearError`

### 2. **postSlice** (`src/store/slices/postSlice.ts`)
- Manages posts and current post creation state
- Actions: `setCurrentImage`, `setCurrentCaption`, `addPost`, `toggleLike`, etc.

### 3. **photoEditorSlice** (`src/store/slices/photoEditorSlice.ts`)
- Manages photo editor state (filters, adjustments, transformations)

### 4. **storiesSlice** (`src/store/slices/storiesSlice.ts`)
- Manages stories state
- Actions: `setStories`, `addStory`, `markStoryAsViewed`, `setCurrentStoryIndex`, etc.

### 5. **marketplaceSlice** (`src/store/slices/marketplaceSlice.ts`)
- Manages marketplace products and cart
- Async thunks: `fetchProducts`, `fetchProduct`
- Actions: `addToCart`, `removeFromCart`, `setSelectedCategory`, etc.

## Usage

### Using Redux Hooks

We provide a convenient `useAuth` hook that mimics the Zustand API for easier migration:

```typescript
import { useAuth } from '../../store/hooks';

function MyComponent() {
  const { user, token, signIn, signOut } = useAuth();
  // ...
}
```

### Direct Redux Hooks

For other slices, use the standard Redux hooks:

```typescript
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchProducts, addToCart } from '../../store/slices/marketplaceSlice';

function MarketplaceComponent() {
  const dispatch = useAppDispatch();
  const products = useAppSelector((state) => state.marketplace.products);
  const cart = useAppSelector((state) => state.marketplace.cart);

  const handleAddToCart = (productId: string, quantity: number) => {
    dispatch(addToCart({ product_id: productId, quantity }));
  };

  useEffect(() => {
    dispatch(fetchProducts());
  }, [dispatch]);
}
```

## Migration Status

### ✅ Completed
- Auth state migrated from Zustand to Redux
- Store configured with all slices
- App.tsx updated to use Redux Provider
- RootNavigator updated to use Redux
- AuthScreen updated
- FeedScreen updated
- CategoryPickScreen updated
- MessagesScreen updated

### 🔄 In Progress
- Other components still using `useAuthStore` need to be migrated to `useAuth` hook

### Files Still Using Zustand
The following files still reference `useAuthStore` and should be migrated:
- `src/screens/Profile/ProfileScreen.tsx`
- `src/screens/Profile/PublicProfileScreen.tsx`
- `src/screens/Post/PostScreen.tsx`
- `src/screens/Post/PostDetailScreen.tsx`
- `src/screens/Reels/ReelsScreen.tsx`
- `src/screens/Comments/CommentsScreen.tsx`
- `src/screens/Instructor/InstructorScreen.tsx`
- `src/screens/Business/BizSettings.tsx`
- `src/app/navigation/tabs/IndividualTabs.tsx`
- `src/screens/KYC/KYCScreen.tsx`
- `src/screens/Marketplace/MarketplaceScreen.tsx`

## Migration Steps

To migrate a component from Zustand to Redux:

1. **Replace import:**
   ```typescript
   // Before
   import { useAuthStore } from '../../state/useAuthStore';
   
   // After
   import { useAuth } from '../../store/hooks';
   ```

2. **Update hook usage:**
   ```typescript
   // Before
   const { user, token } = useAuthStore();
   
   // After
   const { user, token } = useAuth();
   ```

3. **For async operations, use dispatch:**
   ```typescript
   // Before
   await signIn(email, password);
   
   // After
   const { signIn } = useAuth();
   await signIn(email, password);
   ```

## Store Configuration

The store is configured in `src/store/store.ts` with:
- All slices registered
- Middleware configured for non-serializable values (image URIs)
- TypeScript types exported (`RootState`, `AppDispatch`)

## Best Practices

1. **Use selectors for derived state:**
   ```typescript
   const isAuthenticated = useAppSelector((state) => !!state.auth.token);
   ```

2. **Use async thunks for API calls:**
   ```typescript
   dispatch(fetchProducts(category));
   ```

3. **Keep components simple:**
   - Use hooks to access state
   - Dispatch actions for state changes
   - Keep business logic in thunks or reducers

4. **Type safety:**
   - Always use `useAppSelector` and `useAppDispatch` for type safety
   - Import types from slices when needed

## Zustand Legacy

The old Zustand store (`src/state/useAuthStore.ts`) is still present for backward compatibility but should not be used in new code. It will be removed once all components are migrated.
